import type { OnboardingPair } from '@meal-rescue/shared-types';

export type OnboardingMealGroup =
  'rice_based' | 'noodle' | 'breakfast_bowl' | 'soup' | 'yogurt_bowl' | 'potato';

/**
 * Diagnostic A/B pairs. Every pair measures ANTICIPATED meal-completion
 * preference (which addition would make the base meal better), never
 * post-eating satisfaction - that arrives later via behavior.
 *
 * Design rules:
 * - Same base meal, two additions; base never changes between options.
 * - Each pair's `tests` load on 1-2 latent factors; collectively every
 *   factor is diagnosed by at least two pairs.
 * - Options are pantry-familiar, low-effort, low-cost (safe set).
 * - cuisineLabel is display metadata only - never written to taste_memories.
 */
export const PAIRS: OnboardingPair[] = [
  {
    id: 'pair-01',
    baseMeal: {
      name: 'Plain steamed rice',
      emoji: '🍚',
      mealGroup: 'rice_based',
      cuisineLabel: 'Japanese bowl night',
    },
    optionA: {
      name: 'scrambled egg',
      emoji: '🥚',
      role: 'protein',
      blurb: 'warm, soft, and filling',
    },
    optionB: {
      name: 'sesame oil + furikake',
      emoji: '🧂',
      role: 'umami seasoning',
      blurb: 'toasty, savory, no cooking',
    },
    tests: [
      { factor: 'nutritional', weight: 0.6 },
      { factor: 'satisfaction', weight: 0.4 },
    ],
    question: 'Plain rice is a blank canvas. Which would make it better for you?',
  },
  {
    id: 'pair-02',
    baseMeal: {
      name: 'Instant noodles',
      emoji: '🍜',
      mealGroup: 'noodle',
      cuisineLabel: 'Late-night noodle run',
    },
    optionA: {
      name: 'leftover chicken',
      emoji: '🍗',
      role: 'protein',
      blurb: 'already cooked, just warm it',
    },
    optionB: {
      name: 'soft-cooked egg',
      emoji: '🥚',
      role: 'protein',
      blurb: 'rich yolk, quick to make',
    },
    tests: [
      { factor: 'nutritional', weight: 0.5 },
      { factor: 'sensory', weight: 0.5 },
    ],
    question: 'Which noodles feel more like a real meal to you?',
  },
  {
    id: 'pair-03',
    baseMeal: {
      name: 'Oatmeal',
      emoji: '🥣',
      mealGroup: 'breakfast_bowl',
      cuisineLabel: 'Morning oats',
    },
    optionA: {
      name: 'banana + peanut butter',
      emoji: '🍌',
      role: 'comfort topping',
      blurb: 'creamy, sweet, familiar',
    },
    optionB: {
      name: 'frozen berries',
      emoji: '🫐',
      role: 'fresh fruit',
      blurb: 'bright and light',
    },
    tests: [
      { factor: 'satisfaction', weight: 0.5 },
      { factor: 'exploration', weight: 0.5 },
    ],
    question: 'Which oats sound better to you this week?',
  },
  {
    id: 'pair-04',
    baseMeal: {
      name: 'Canned tomato soup',
      emoji: '🍅',
      mealGroup: 'soup',
      cuisineLabel: 'Quick soup lunch',
    },
    optionA: {
      name: 'grilled cheese on the side',
      emoji: '🧀',
      role: 'classic pairing',
      blurb: 'gooey and comforting',
    },
    optionB: {
      name: 'white beans + spinach',
      emoji: '🥬',
      role: 'hearty greens',
      blurb: 'stretches it into a fuller bowl',
    },
    tests: [
      { factor: 'satisfaction', weight: 0.6 },
      { factor: 'nutritional', weight: 0.4 },
    ],
    question: 'Which way makes tomato soup feel complete?',
  },
  {
    id: 'pair-05',
    baseMeal: {
      name: 'Plain yogurt bowl',
      emoji: '🥛',
      mealGroup: 'yogurt_bowl',
      cuisineLabel: 'Snack plate',
    },
    optionA: {
      name: 'granola + honey',
      emoji: '🍯',
      role: 'crunch + sweet',
      blurb: 'crunchy, classic',
    },
    optionB: {
      name: 'smashed berries + chia',
      emoji: '🍓',
      role: 'fresh + seedy',
      blurb: 'fruity, a little adventurous',
    },
    tests: [
      { factor: 'sensory', weight: 0.5 },
      { factor: 'modification', weight: 0.5 },
    ],
    question: 'Which yogurt bowl would you reach for?',
  },
  {
    id: 'pair-06',
    baseMeal: {
      name: 'Baked potato',
      emoji: '🥔',
      mealGroup: 'potato',
      cuisineLabel: 'Loaded potato',
    },
    optionA: {
      name: 'cheese + sour cream',
      emoji: '🧀',
      role: 'rich topping',
      blurb: 'creamy, classic loaded potato',
    },
    optionB: {
      name: 'beans + chili seasoning',
      emoji: '🌶️',
      role: 'hearty topping',
      blurb: 'warming and filling',
    },
    tests: [
      { factor: 'sensory', weight: 0.5 },
      { factor: 'exploration', weight: 0.5 },
    ],
    question: 'How would you want that potato?',
  },
  {
    id: 'pair-07',
    baseMeal: {
      name: 'Rice + canned beans bowl',
      emoji: '🍛',
      mealGroup: 'rice_based',
      cuisineLabel: 'Pantry bowl',
    },
    optionA: {
      name: 'hot sauce + lime',
      emoji: '🌶️',
      role: 'spicy + bright',
      blurb: 'bold, a little kick',
    },
    optionB: {
      name: 'sliced avocado',
      emoji: '🥑',
      role: 'cream + healthy fat',
      blurb: 'smooth and rich',
    },
    tests: [
      { factor: 'modification', weight: 0.6 },
      { factor: 'nutritional', weight: 0.4 },
    ],
    question: 'Which would make the pantry bowl better for you?',
  },
];

export function getPair(pairId: string): OnboardingPair | undefined {
  return PAIRS.find((p) => p.id === pairId);
}

/**
 * Meal-group to related meal-groups. Phase 4 will turn this into the full
 * meal x addition compatibility matrix; onboarding only ever needs the
 * base meal's own group.
 */
export function mealGroupsForMealGroup(mealGroup: string): string[] {
  return [mealGroup];
}
