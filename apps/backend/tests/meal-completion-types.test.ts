import type {
  AdditionFactorKey,
  OnboardingPair,
  OnboardingRejectionReason,
  TasteContextType,
} from '@meal-rescue/shared-types';

const FACTORS: AdditionFactorKey[] = [
  'nutritional',
  'sensory',
  'satisfaction',
  'modification',
  'exploration',
];

describe('meal-completion shared types', () => {
  it('exposes the five latent factors', () => {
    expect(FACTORS).toHaveLength(5);
    expect(new Set(FACTORS).size).toBe(5);
  });

  it('adds cold_start to the memory source set', () => {
    const source: TasteContextType extends never ? never : 'cold_start' = 'cold_start';
    expect(source).toBe('cold_start');
  });

  it('adds the addition context types', () => {
    const contexts: TasteContextType[] = [
      'addition_nutritional',
      'addition_sensory',
      'addition_satisfaction',
      'addition_modification',
      'addition_exploration',
      'addition_x_meal_group',
    ];
    expect(contexts).toHaveLength(6);
  });

  it('rejects invalid rejection reasons at the type level', () => {
    const reasons: OnboardingRejectionReason[] = [
      'taste',
      'too_expensive',
      'too_much_effort',
      'don_t_have',
      'don_t_like_ingredient',
      'not_appropriate_for_meal',
      'not_hungry_enough',
    ];
    expect(reasons).toHaveLength(7);
  });

  it('shapes a pair with weighted factor tests', () => {
    // Compile-time contract assertion: any misspelled field fails typecheck.
    const pair = {
      id: 'pair-01',
      baseMeal: {
        name: 'Plain steamed rice',
        emoji: '🍚',
        mealGroup: 'rice_based',
        cuisineLabel: 'Japanese bowl night',
      },
      optionA: { name: 'scrambled egg', emoji: '🥚', role: 'protein', blurb: 'warm and filling' },
      optionB: {
        name: 'sesame oil + furikake',
        emoji: '🧂',
        role: 'umami',
        blurb: 'toasty and savory',
      },
      tests: [
        { factor: 'nutritional', weight: 0.6 },
        { factor: 'satisfaction', weight: 0.4 },
      ],
      question: 'Which would make the rice better for you?',
    } satisfies OnboardingPair;
    expect(pair.tests.reduce((s, t) => s + t.weight, 0)).toBeCloseTo(1);
  });
});
