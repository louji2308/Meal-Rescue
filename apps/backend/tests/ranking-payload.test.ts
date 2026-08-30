import { PROMPT_VERSIONS } from '../src/services/ai/prompts';
import { buildRankingPayload } from '../src/services/ranking-engine.service';

describe('buildRankingPayload', () => {
  const candidates = [
    {
      id: 'c1',
      type: 'addition' as const,
      additions: [{ name: 'egg' }],
      substitutions: [],
      estimatedTime: 5,
      estimatedCost: 'low' as const,
      requiredEquipment: [],
      cookingSteps: 0,
      nutritionalImprovement: { protein: 'added' as const },
      preferenceAlignment: 0.5,
    },
  ];
  const meal = {
    detectedFoods: [{ name: 'instant noodles' }],
    detectedComponents: { protein: false, fiber_sources: true, healthy_fat_sources: true },
  };
  const constraints = {};
  const preferences = { favoriteFoods: ['egg'], avoidedFoods: [] };

  it('omits the cold-start block when no profile is given', () => {
    const payload = buildRankingPayload({
      candidates,
      meal,
      missingComponents: ['protein'],
      constraints,
      preferences,
      profile: null,
      recentlyShown: [],
    });
    expect(payload.preferences.coldStartProfile).toBeUndefined();
    expect(payload.custom.mealGroup).toBe('noodle');
    expect(payload.custom.recentlyShown).toEqual([]);
  });

  it('embeds profile details + derives meal group when provided', () => {
    const payload = buildRankingPayload({
      candidates,
      meal,
      missingComponents: ['protein'],
      constraints,
      preferences,
      profile: {
        coldStartFactors: [
          { factor: 'nutritional' as const, affinity: 0.8, confidence: 'confirmed' as const },
        ],
        mealGroupAffinities: { rice_based: 0.4 },
        profileConfidence: 1,
        mealGroup: 'rice_based' as const,
      },
      recentlyShown: ['sesame oil'],
    });
    expect(payload.preferences.coldStartProfile).toEqual({
      coldStartFactors: [{ factor: 'nutritional', affinity: 0.8, confidence: 'confirmed' }],
      mealGroupAffinities: { rice_based: 0.4 },
      profileConfidence: 1,
    });
    expect(payload.custom.profile!.mealGroup).toBe('rice_based');
    expect(payload.custom.mealGroup).toBe('rice_based');
  });
});

describe('prompt version', () => {
  it('bumps candidateRanking for the new cold-start inputs', () => {
    expect(PROMPT_VERSIONS.candidateRanking).toBe('v2.1-mr2');
  });
});
