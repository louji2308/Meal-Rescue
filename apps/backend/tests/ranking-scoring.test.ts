import { HeuristicLlmClient } from '../src/services/ai/heuristic-llm-client';
import type { RankingPayload } from '../src/services/ai/heuristic-llm-client';
import { rankingResultSchema } from '../src/services/ai/llm-schemas';

const client = new HeuristicLlmClient();

async function rank(payload: RankingPayload) {
  const response = await client.completeJson({
    systemPrompt: 'Rank candidates',
    userContent: payload as unknown as Record<string, unknown>,
    schema: rankingResultSchema,
    modelName: 'heuristic',
  });
  return response.data.rankedCandidates;
}

function candidate(
  id: string,
  overrides: Partial<NonNullable<RankingPayload['candidates']>[number]> = {},
): NonNullable<RankingPayload['candidates']>[number] {
  return {
    id,
    type: 'addition',
    additions: [{ name: 'egg' }],
    estimatedTime: 5,
    cookingSteps: 0,
    nutritionalImprovement: { protein: 'adds protein' },
    preferenceAlignment: 0.6,
    ...overrides,
  };
}

describe('deterministic ranking - weighted additive (§7)', () => {
  it('ranks a fresh candidate above a recently-shown one, all else equal (§8 anti-fatigue)', async () => {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [
        candidate('repeat', { additions: [{ name: 'egg' }] }),
        candidate('fresh', { additions: [{ name: 'canned tuna' }] }),
      ],
      custom: { mealGroup: 'rice_based', profile: null, recentlyShown: ['egg'] },
    });
    expect(ranked[0]!.candidateId).toBe('fresh');
    expect(ranked[1]!.candidateId).toBe('repeat');
    expect(ranked[1]!.overallScore).toBeLessThan(ranked[0]!.overallScore);
  });

  it('guardrail: a strongly-preferred compatible candidate beats a fresh alternative (§8)', async () => {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [
        candidate('strong', { additions: [{ name: 'egg' }], preferenceAlignment: 0.95 }),
        candidate('novel', { additions: [{ name: 'canned tuna' }], preferenceAlignment: 0.5 }),
      ],
      custom: { mealGroup: 'rice_based', profile: null, recentlyShown: ['egg'] },
    });
    expect(ranked[0]!.candidateId).toBe('strong');
    expect(ranked[0]!.overallScore).toBeGreaterThanOrEqual(0.85);
  });
});

describe('safety gate (§7)', () => {
  const safe = candidate('safe', {
    additions: [{ name: 'egg' }],
    estimatedTime: 15,
    preferenceAlignment: 0.4,
  });
  const risky = candidate('risky', {
    additions: [{ name: 'canned tuna' }],
    estimatedTime: 5,
    cookingSteps: 1,
    preferenceAlignment: 0.85,
  });

  async function scorePair(profileConfidence: number) {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [safe, risky],
      custom: {
        mealGroup: 'rice_based',
        profile: {
          coldStartFactors: [],
          mealGroupAffinities: {},
          profileConfidence,
          mealGroup: 'rice_based',
        },
        recentlyShown: [],
      },
    });
    return {
      safe: ranked.find((row) => row.candidateId === 'safe')!.overallScore,
      risky: ranked.find((row) => row.candidateId === 'risky')!.overallScore,
      order: ranked.map((row) => row.candidateId),
    };
  }

  it('adds exactly the safety boost at low confidence but never overrides a strong pick', async () => {
    const high = await scorePair(0.9);
    const low = await scorePair(0.2);
    expect(low.safe - high.safe).toBeCloseTo(0.08, 3);
    expect(low.order).toEqual(high.order);
  });
});
