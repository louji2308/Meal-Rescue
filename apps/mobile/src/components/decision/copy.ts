import type {
  CleanupTolerance,
  DecisionAction,
  MealIntent,
  RealityBudgetLevel,
  RealityTimeBudget,
} from '@meal-rescue/shared-types';

/**
 * All user-facing copy for the V2 decision UX.
 *
 * These strings are deliberately warm and non-clinical. They live here so the
 * intent/reality/craving/result surfaces share one voice and stay easy to
 * tweak without touching component logic. NEVER show internal terms like
 * "SATISFY", "constraint optimization", "nutritionRationale", or dietary rank.
 */

interface IntentOption {
  intent: MealIntent;
  /** Short human label shown on the tap target. */
  label: string;
  /** One encouraging line under the label. */
  caption: string;
  /** Icon key used by @expo/vector-icons Ionicons. */
  icon: string;
}

export const INTENT_OPTIONS: IntentOption[] = [
  {
    intent: 'SATISFY',
    label: 'Make it more satisfying',
    caption: 'A little extra to really hit the spot.',
    icon: 'sparkles-outline',
  },
  {
    intent: 'PRESERVE',
    label: 'Keep it basically the same',
    caption: 'It already works. Let’s not mess with it.',
    icon: 'heart-outline',
  },
  {
    intent: 'LIGHTEN',
    label: 'Make it lighter & fresher',
    caption: 'A cooler, brighter take on the plate.',
    icon: 'leaf-outline',
  },
  {
    intent: 'DECIDE',
    label: 'I’m hungry — help me decide',
    caption: 'No strong feelings. You pick for me.',
    icon: 'help-circle-outline',
  },
  {
    intent: 'NO_COOK',
    label: 'Just eat it — keep it simple',
    caption: 'No cooking. Zero fuss. Onto the plate.',
    icon: 'flash-outline',
  },
];

export function intentCopy(intent: MealIntent): IntentOption {
  return INTENT_OPTIONS.find((o) => o.intent === intent) ?? INTENT_OPTIONS[3]!;
}

export const TIME_OPTIONS: Array<{ value: RealityTimeBudget; label: string }> = [
  { value: 5, label: '~5 min' },
  { value: 15, label: '~15 min' },
  { value: 30, label: '~30 min' },
];

export const BUDGET_OPTIONS: Array<{ value: RealityBudgetLevel; label: string }> = [
  { value: 'LOW', label: 'Keep it cheap' },
  { value: 'MEDIUM', label: 'A little is fine' },
  { value: 'OPEN', label: 'No budget worry' },
];

export const CLEANUP_OPTIONS: Array<{ value: CleanupTolerance; label: string }> = [
  { value: 'LOW', label: 'Minimal cleanup' },
  { value: 'MEDIUM', label: 'Some is fine' },
  { value: 'HIGH', label: 'I’ll wash whatever' },
];

/** ------------------------------------------------------------------ */
/** BEST MOVE action lines (plan §9 / §13)                              */
/** ------------------------------------------------------------------ */

export function actionLine(action: DecisionAction | undefined, additions: string[]): string {
  const extra = additions.length > 0 ? additions.join(' + ') : '';
  switch (action) {
    case 'RESCUE':
      return extra ? `Rescue it — lift it with ${extra}.` : 'Rescue your plate — it’s worth it.';
    case 'ADD':
      return extra ? `Add ${extra} to round it out.` : 'Add one small thing to make it pop.';
    case 'COMBINE':
      return extra
        ? `Combine it with ${extra} for a fuller bite.`
        : 'Bring these together for a fuller plate.';
    case 'USE_LEFTOVER':
      return extra
        ? `Use up the leftover — fold in ${extra}.`
        : 'Use up a leftover you already have.';
    case 'USE_EXPIRING':
      return extra ? `Use up the ${extra} tonight.` : 'Use something up before it goes.';
    case 'KEEP_AS_IS':
      return 'Looks great — no changes needed.';
    default: {
      // Pre-integration fallback: backend may not send decision.actionType yet.
      return extra ? `Add ${extra} to make it better.` : 'Try this easy next move.';
    }
  }
}

/** A single humane cost line, e.g. "~15 min · low effort". */
export function costLine(
  minutes: number | undefined,
  costLevel: 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
): string {
  const time = minutes != null && minutes > 0 ? `~${minutes} min` : 'quick';
  const effort =
    costLevel === 'LOW' ? 'low effort' : costLevel === 'MEDIUM' ? 'regular' : 'a bit more effort';
  return `${time} · ${effort}`;
}

/**
 * One plain-language "why" for the best move (plan §35):
 * built only from booleans we can trust - never calorie/macro claims.
 */
export function whyLine(
  action: DecisionAction | undefined,
  candidate: {
    satisfiesIntent?: boolean;
    satisfiesReality?: boolean;
    nutritionRationale?: { protein?: boolean; fibre?: boolean; healthyFat?: boolean };
  },
  _meals: string[],
): string {
  if (
    action === 'KEEP_AS_IS' ||
    (!action && !candidate.satisfiesIntent && !candidate.satisfiesReality)
  ) {
    return 'This already fits what you told us — you’re good.';
  }

  const reasons: string[] = [];
  if (candidate.satisfiesIntent) reasons.push('it matches what you want right now');
  if (candidate.satisfiesReality) reasons.push('it fits your time and energy');
  if (candidate.nutritionRationale?.protein) reasons.push('it rounds out the protein');
  if (candidate.nutritionRationale?.fibre) reasons.push('it adds a little fibre');
  if (candidate.nutritionRationale?.healthyFat) reasons.push('it brings some healthy fat');

  if (reasons.length === 0) {
    return 'A simple way to make this plate work better.';
  }
  return `Why: ${reasons.join(', ')}.`;
}

/** ------------------------------------------------------------------ */
/** Craving lock — dynamic chips based on detected food + time of day    */
/** ------------------------------------------------------------------ */

/**
 * Food-category patterns for generating relevant craving chips.
 * Each entry: [regex to match food name, chip options].
 */
const FOOD_CHIP_RULES: Array<{ match: RegExp; chips: string[] }> = [
  {
    match: /noodle|ramen|pasta|spaghetti/i,
    chips: ['Keep the noodles', 'Add protein', 'Make it spicy', 'Add veggies'],
  },
  {
    match: /toast|bread|sandwich|bagel/i,
    chips: ['Keep the crunch', 'Add protein', 'Something fresh', 'Keep it simple'],
  },
  {
    match: /rice|burrito|wrap|taco/i,
    chips: ['Keep it warm', 'Add salsa', 'Make it fresh', 'Keep it hearty'],
  },
  {
    match: /salad|greens|lettuce/i,
    chips: ['Keep it fresh', 'Add avocado', 'Make it heartier', 'Keep it light'],
  },
  {
    match: /soup|stew|broth/i,
    chips: ['Keep it cozy', 'Add something crunchy', 'Make it richer', 'Keep it warm'],
  },
  {
    match: /egg|omelette|scramble/i,
    chips: ['Keep it simple', 'Add cheese', 'Add veggies', 'Make it heartier'],
  },
  {
    match: /chicken|beef|fish|meat|steak/i,
    chips: ['Keep it juicy', 'Add a sauce', 'Make it lighter', 'Keep it hearty'],
  },
  {
    match: /pizza|pie|flatbread/i,
    chips: ['Keep the crunch', 'Add toppings', 'Make it fresh', 'Keep it simple'],
  },
  {
    match: /fruit|banana|apple|berry/i,
    chips: ['Keep it sweet', 'Add something creamy', 'Keep it fresh', 'Make it filling'],
  },
  {
    match: /cereal|oat|porridge|granola/i,
    chips: ['Keep it warm', 'Add fruit', 'Make it crunchy', 'Keep it simple'],
  },
];

/** Default chips when no food pattern matches. */
const DEFAULT_CHIPS = ['Keep it as is', 'Add protein', 'Something fresh', 'Keep it simple'];

/** Time-of-day extra chip (appended when relevant). */
const TIME_CHIPS: Record<string, string> = {
  morning: 'Quick & easy',
  afternoon: 'Something light',
  evening: 'Make it cozy',
  night: 'Keep it warm',
};

/**
 * Generate 4 dynamic craving chips based on what the user actually showed us.
 * Replaces the old static "Keep the noodles" list.
 */
export function generateCravingChips(detectedFoods: string[], phase?: string): string[] {
  const foodText = detectedFoods.join(' ').toLowerCase();
  let chips = DEFAULT_CHIPS;

  for (const rule of FOOD_CHIP_RULES) {
    if (rule.match.test(foodText)) {
      chips = rule.chips;
      break;
    }
  }

  // Add a time-relevant chip if it's not already covered.
  if (phase && TIME_CHIPS[phase]) {
    const timeChip = TIME_CHIPS[phase];
    if (!chips.includes(timeChip)) {
      chips = [chips[0], chips[1], timeChip, chips[3]];
    }
  }

  return chips;
}

export function cravingEmpowermentLine(): string {
  return "Tell us what you're craving — we'll keep it safe, not swap it away.";
}
