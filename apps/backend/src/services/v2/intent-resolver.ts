/**
 * V2 Intent Resolver (plan §4 / §5).
 *
 * Normalizes the mobile intent selector into an internal MealIntent.
 * Absent intent -> DECIDE (permissive, non-judgmental).
 *
 * The resolver NEVER infers emotion or mood; it only interprets an explicit
 * stated intent. Shaping/filtering of candidates that follows from intent is
 * applied in the DecisionEngineService, not here.
 */
import type { MealIntent } from '@meal-rescue/shared-types';

export const INTENT_ORDER: MealIntent[] = ['SATISFY', 'PRESERVE', 'LIGHTEN', 'NO_COOK', 'DECIDE'];

const VALID_INTENTS = new Set<MealIntent>(INTENT_ORDER);

export function resolveIntent(intent: MealIntent | undefined): MealIntent {
  if (intent !== undefined && VALID_INTENTS.has(intent)) return intent;
  return 'DECIDE';
}

/**
 * Whether intent narrows the candidate SET. SATISFY/PRESERVE/DECIDE only shape
 * ordering; LIGHTEN and NO_COOK explicitly filter candidates (§5).
 */
export function intentIsNarrowing(intent: MealIntent): boolean {
  return intent === 'LIGHTEN' || intent === 'NO_COOK';
}
