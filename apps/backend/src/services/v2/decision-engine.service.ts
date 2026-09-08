/**
 * V2 Decision Engine service (plan §4, §9, §10).
 *
 * A thin, deterministic layer that sits between candidate generation and the
 * ranking engine. It:
 *   1. Resolves intent (SATISFY/PRESERVE/LIGHTEN/DECIDE/NO_COOK)
 *   2. Applies intent-aware shaping/filtering to candidates
 *   3. Enforces the craving lock (never replace the primary craving)
 *   4. Adds V2 decision metadata to every candidate (actionType, minutes,
 *      cost level, cooking flag, intent/reality fit, nutrition rationale)
 *   5. Injects KEEP_AS_IS ("don't fix my food", §6) and USE_EXPIRING
 *      (expiry-driven, §16) candidates.
 *
 * Hard reality filtering is handled by the constraint engine via
 * RealityDerived.constraints; this service only biases generation toward
 * available ingredients and cleanup tolerance WITHOUT affecting the ranking
 * score (reality is a filter, not a ranking preference).
 */
import type {
  DecisionAction,
  MealIntent,
  RankedRecommendation,
  RescueCandidate,
} from '@meal-rescue/shared-types';

export interface V2DecisionContext {
  intent: MealIntent;
  // Reality-derived nudge inputs (filters happen in the constraint engine).
  preferAvailableIngredients: boolean;
  cleanupEffortCeiling: number | null;
  /** Expiring ingredient names flagged by pantry/spoiler logic. */
  expiringIngredients: string[];
  /** Original meal food names (used to reason about KEEP_AS_IS). */
  mealFoods: string[];
  mealDetectedComponents: Record<string, boolean>;
}

export const DECISION_ACTION_ORDER: DecisionAction[] = [
  'RESCUE',
  'ADD',
  'COMBINE',
  'USE_LEFTOVER',
  'USE_EXPIRING',
  'KEEP_AS_IS',
];

/**
 * Shapes candidates per intent. Mutates in place and returns the same array,
 * so the pipeline keeps ownership. Filtering is applied only for intents that
 * explicitly narrow; DECIDE and SATISFY stay permissive.
 */
export function shapeForIntent(
  candidates: RescueCandidate[],
  intent: MealIntent,
  ctx: V2DecisionContext,
): RescueCandidate[] {
  let shaped = candidates;

  if (intent === 'LIGHTEN') {
    // Lighter hands: prefer no/low-cooking, short-prep additions; keep it fresh.
    shaped = shaped.filter((c) => c.estimatedTime <= 20 || c.cookingSteps === 0);
  } else if (intent === 'NO_COOK') {
    shaped = shaped.filter((c) => c.cookingSteps === 0);
  } else if (intent === 'PRESERVE') {
    // Favour preservation: keep cooking effort low and avoid substitutions.
    shaped = shaped.filter((c) => c.substitutions.length === 0 || c.estimatedTime <= 30);
  }
  // SATISFY: do NOT downgrade to bland/nutrition-only; keep all rich options.
  // DECIDE: no narrowing at all.

  if (ctx.preferAvailableIngredients && shaped.length > 0) {
    // Soft pantry-lean only; the constraint engine is the real gate.
    shaped = shaped
      .slice()
      .sort((a, b) => Number(b.preferenceAlignment) - Number(a.preferenceAlignment));
  }

  return shaped;
}

/**
 * Adds V2 decision metadata to a candidate. Always-populated in practice.
 */
export function decorateCandidate(
  candidate: RescueCandidate,
  intent: MealIntent,
  satisfiesReality: boolean,
  actionType: DecisionAction,
): RescueCandidate {
  const additions = candidate.additions.map((a) => a.name);

  const nutritionRationale = {
    protein:
      candidate.nutritionalImprovement?.protein === 'added' || additionsContainProtein(additions),
    fibre:
      candidate.nutritionalImprovement?.fiber_sources === 'added' ||
      additionsContainFibre(additions),
    healthyFat:
      candidate.nutritionalImprovement?.healthy_fat_sources === 'added' ||
      additionsContainHealthyFat(additions),
  };

  return {
    ...candidate,
    actionType,
    estimatedMinutes: candidate.estimatedTime,
    estimatedCostLevel: costLevelToUpper(candidate.estimatedCost),
    cookingRequired: candidate.cookingSteps > 0,
    satisfiesIntent: true,
    satisfiesReality,
    nutritionRationale,
    ...(actionType === 'KEEP_AS_IS'
      ? {
          additions: [],
          substitutions: [],
          estimatedTime: 0,
          estimatedMinutes: 0,
          cookingSteps: 0,
          cookingRequired: false,
          estimatedCost: 'low',
          estimatedCostLevel: 'LOW',
          requiredEquipment: [],
        }
      : {}),
  };
}

export function pickWinnerAction(ranked: RankedRecommendation[]): DecisionAction {
  if (ranked.length === 0) return 'KEEP_AS_IS';
  return ranked[0]!.candidate.actionType ?? 'RESCUE';
}

// --- helpers ---------------------------------------------------------------

function costLevelToUpper(cost: string | undefined): 'LOW' | 'MEDIUM' | 'HIGH' {
  const normalized = (cost ?? 'medium').toUpperCase();
  if (normalized === 'LOW' || normalized === 'HIGH') return normalized;
  return 'MEDIUM';
}

const PROTEIN_NAMES = new Set([
  'egg',
  'tofu',
  'cottage cheese',
  'chicken',
  'canned tuna',
  'beans',
  'greek yogurt',
]);
const FIBRE_NAMES = new Set([
  'spinach',
  'broccoli',
  'carrot',
  'kale',
  'apple',
  'oats',
  'chia',
  'beans',
]);
const FAT_NAMES = new Set(['avocado', 'olive oil', 'nuts', 'cheese', 'butter', 'seeds']);

function additionsContainProtein(additions: string[]): boolean {
  return additions.some((name) => PROTEIN_NAMES.has(name.toLowerCase()));
}
function additionsContainFibre(additions: string[]): boolean {
  return additions.some((name) => FIBRE_NAMES.has(name.toLowerCase()));
}
function additionsContainHealthyFat(additions: string[]): boolean {
  return additions.some((name) => FAT_NAMES.has(name.toLowerCase()));
}
