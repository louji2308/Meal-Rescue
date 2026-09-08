/**
 * V2 Reality Context (plan §8).
 *
 * Reality is a HARD constraint, not a preference. This module converts the
 * mobile `RealityContext` into `Constraints` that the deterministic constraint
 * engine enforces as filters:
 *   - timeAvailable   -> the realistic prep limit (5|15|30)
 *   - cookingAllowed  -> false means no-heat candidates only
 *   - budgetLevel     -> LOW / MEDIUM respected as a cost cap
 *   - useAvailableIngredients -> surfaced to generation as a pantry-lean hint
 *   - cleanupTolerance -> not a hard filter (applied to ranking only, see below)
 *
 * Reality FILTERS candidates; it never directly biases the ranking score.
 * cleanupTolerance maps to the `cookingSteps`/preference surface without
 * becoming a filter.
 */
import type { Constraints, RealityContext } from '@meal-rescue/shared-types';

export interface RealityDerived {
  /** Hard constraints merged onto the caller's existing Constraints. */
  constraints: Constraints;
  /** True when cooking is disallowed - drives no-heat generation. */
  noCooking: boolean;
  /** True when generation should bias toward ingredients already on hand. */
  preferAvailableIngredients: boolean;
  /** 0-1 effort ceiling derived from cleanupTolerance (ranking nudge only). */
  cleanupEffortCeiling: number | null;
}

const TIME_BUDGETS: Array<RealityContext['timeAvailable']> = [5, 15, 30];
const BUDGET_MAP = { LOW: 'low' as const, MEDIUM: 'medium' as const };

export function deriveReality(constraints: Constraints, reality?: RealityContext): RealityDerived {
  if (!reality) {
    return {
      constraints,
      noCooking: constraints.cookingRequired === false,
      preferAvailableIngredients: false,
      cleanupEffortCeiling: null,
    };
  }

  const next: Constraints = { ...constraints };

  if (reality.timeAvailable !== undefined && TIME_BUDGETS.includes(reality.timeAvailable)) {
    // Keep the caller's explicit time if it is tighter than the reality budget.
    if (next.timeMinutes === undefined || next.timeMinutes > reality.timeAvailable) {
      next.timeMinutes = reality.timeAvailable;
    }
  }

  next.cookingRequired = reality.cookingAllowed === false ? false : next.cookingRequired;

  if (reality.budgetLevel === 'LOW' || reality.budgetLevel === 'MEDIUM') {
    const mapped = BUDGET_MAP[reality.budgetLevel];
    const ranks = { low: 0, medium: 1, high: 2 } as const;
    // Tighten only if it doesn't relax an existing tighter constraint.
    if (next.budget === undefined || ranks[mapped] < ranks[next.budget]) {
      next.budget = mapped;
    }
  }

  const preferAvailableIngredients = reality.useAvailableIngredients;

  let cleanupEffortCeiling: number | null = null;
  if (reality.cleanupTolerance === 'LOW') cleanupEffortCeiling = 1;
  else if (reality.cleanupTolerance === 'MEDIUM') cleanupEffortCeiling = 3;

  return {
    constraints: next,
    noCooking: next.cookingRequired === false,
    preferAvailableIngredients,
    cleanupEffortCeiling,
  };
}
