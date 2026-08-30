import {
  additionsFromRescues,
  deriveMealGroup,
  factorAffinityForCandidate,
  familyBenefit,
  familyCounts,
  genericMealPrior,
  normalize,
  normalizeIngredientNames,
  profileConfidenceFromFactors,
  recencyPenalty,
  recentAppearances,
  roleClassForAddition,
} from '../src/services/ranking/cold-start-signals';

describe('deriveMealGroup', () => {
  it('classifies meals into onboarding groups', () => {
    expect(deriveMealGroup(['plain steamed rice'])).toBe('rice_based');
    expect(deriveMealGroup(['instant noodles', 'wheat ramen'])).toBe('noodle');
    expect(deriveMealGroup(['oatmeal'])).toBe('breakfast_bowl');
    expect(deriveMealGroup(['canned tomato soup'])).toBe('soup');
    expect(deriveMealGroup(['plain yogurt bowl'])).toBe('yogurt_bowl');
    expect(deriveMealGroup(['baked potato'])).toBe('potato');
    expect(deriveMealGroup(['grilled sausages'])).toBe('other');
  });
});

describe('roleClassForAddition', () => {
  it('resolves ingredient-db components to role classes', () => {
    expect(roleClassForAddition('egg')).toBe('protein');
    expect(roleClassForAddition('canned tuna')).toBe('protein');
    expect(roleClassForAddition('rotisserie chicken')).toBe('protein');
    expect(roleClassForAddition('scrambled egg')).toBe('protein');
    expect(roleClassForAddition('zzz-unknown-food')).toBe('unknown');
  });
});

describe('genericMealPrior', () => {
  it('returns small static deltas for known meal group x role combinations', () => {
    expect(genericMealPrior('rice_based', 'protein')).toBe(0.05);
    expect(genericMealPrior('yogurt_bowl', 'fresh')).toBe(0.05);
    expect(genericMealPrior('yogurt_bowl', 'seasoning')).toBe(-0.02);
    expect(genericMealPrior('other', 'protein')).toBe(0);
  });
});

describe('recencyPenalty', () => {
  it('is soft and decaying per spec §8', () => {
    expect(recencyPenalty(0)).toBe(0);
    expect(recencyPenalty(1)).toBe(-0.05);
    expect(recencyPenalty(2)).toBe(-0.15);
    expect(recencyPenalty(3)).toBe(-0.25);
    expect(recencyPenalty(9)).toBe(-0.25);
  });
});

describe('recentAppearances', () => {
  it('counts how many of a candidate additions were recently shown', () => {
    const candidate = {
      id: 'c1',
      type: 'addition',
      additions: [{ name: 'egg' }, { name: 'canned tuna' }],
    };
    expect(recentAppearances(candidate, ['egg', 'sesame oil'])).toBe(1);
    expect(recentAppearances(candidate, ['EGG', 'egg'])).toBe(1);
    expect(recentAppearances(candidate, [])).toBe(0);
  });
});

describe('familyCounts / familyBenefit', () => {
  it('counts shown families and rewards under-shown ones softly', () => {
    expect(familyCounts(['egg'])).toEqual({
      PROTEIN: 1,
      CRUNCH: 0,
      FIBRE_VOLUME: 0,
      UNKNOWN: 0,
    });
    const counts = familyCounts(['egg', 'canned tuna', 'egg']);
    expect(familyBenefit('PROTEIN', counts)).toBe(0);
    expect(familyBenefit('CRUNCH', counts)).toBeCloseTo(0.15, 6);
    expect(familyBenefit('UNKNOWN', counts)).toBe(0);
  });
});

describe('factorAffinityForCandidate', () => {
  it('returns 0 with no learned profile or evidence-independent inputs', () => {
    const profile = {
      coldStartFactors: [
        { factor: 'nutritional' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'sensory' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'satisfaction' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'modification' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'exploration' as const, affinity: 0, confidence: 'unknown' as const },
      ],
      mealGroupAffinities: {},
      profileConfidence: 0,
      mealGroup: 'other' as const,
    };
    const candidate = { id: 's', type: 'substitution', additions: [{ name: 'egg' }] };
    expect(factorAffinityForCandidate(candidate, profile, ['protein'], [])).toBe(0);
  });

  it('is positive when a high nutritional affinity is matched by the candidate', () => {
    const profile = {
      coldStartFactors: [
        { factor: 'nutritional' as const, affinity: 0.9, confidence: 'confirmed' as const },
        { factor: 'sensory' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'satisfaction' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'modification' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'exploration' as const, affinity: 0, confidence: 'unknown' as const },
      ],
      mealGroupAffinities: {},
      profileConfidence: 1,
      mealGroup: 'rice_based' as const,
    };
    const candidate = { id: 'p', type: 'addition', additions: [{ name: 'egg' }] };
    expect(factorAffinityForCandidate(candidate, profile, ['protein'], [])).toBeGreaterThan(0);
  });
});

describe('profileConfidenceFromFactors', () => {
  it('averages confidence values', () => {
    expect(profileConfidenceFromFactors([])).toBe(0);
    expect(
      profileConfidenceFromFactors([
        { confidence: 'unknown' as const },
        { confidence: 'confirmed' as const },
      ]),
    ).toBe(0.5);
  });
});

describe('normalizeIngredientNames', () => {
  it('lowercases, strips punctuation, dedupes', () => {
    expect(normalizeIngredientNames([' Egg ', 'EGG', 'Can tuna!', 'sesame-oil', ''])).toEqual([
      'egg',
      'can tuna',
      'sesame-oil',
    ]);
  });
});

describe('additionsFromRescues', () => {
  it('collects recommended addition names from persisted rescues', () => {
    expect(
      additionsFromRescues([
        {
          selectedRecommendation: {
            candidate: { additions: [{ name: ' Egg' }, { name: 'Tuna' }] },
          },
        },
        { selectedRecommendation: {} },
      ]),
    ).toEqual(['egg', 'tuna']);
  });
});

describe('normalize', () => {
  it('maps affinity [-1,1] onto [0,1]', () => {
    expect(normalize(-1)).toBe(0);
    expect(normalize(0)).toBe(0.5);
    expect(normalize(1)).toBe(1);
  });
});
