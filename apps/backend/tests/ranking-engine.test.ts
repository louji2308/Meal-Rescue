/**
 * Ranking engine tests - LLM output joining, repair of dropped/invented
 * candidates, and provider-failure fallback to deterministic scoring.
 */
import { randomUUID } from 'node:crypto';

import type { ZodType, ZodTypeDef } from 'zod';

import type { RescueCandidate } from '@meal-rescue/shared-types';

import type { CompleteJsonOptions, LlmClient } from '../src/services/ai/llm-client';
import { rankingResultSchema } from '../src/services/ai/llm-schemas';
import { RankingEngineService } from '../src/services/ranking-engine.service';

function candidate(name: string): RescueCandidate {
  return {
    id: randomUUID(),
    type: 'addition',
    additions: [{ name }],
    substitutions: [],
    estimatedTime: 4,
    estimatedCost: 'low',
    requiredEquipment: [],
    cookingSteps: 0,
    nutritionalImprovement: { protein: 'added' },
    preferenceAlignment: 0.5,
  };
}

function stubClient(impl: (options: CompleteJsonOptions<unknown>) => unknown): LlmClient {
  return {
    versionLabel: 'stub',
    async completeJson<T>(options: CompleteJsonOptions<T>) {
      const data = impl(options as CompleteJsonOptions<unknown>);
      return { data: data as T, usage: null };
    },
  };
}

describe('ranking engine', () => {
  const egg = candidate('egg');
  const spinach = candidate('spinach');
  const candidates = [egg, spinach];

  it('returns [] for empty candidate lists without calling the LLM', async () => {
    let called = false;
    const llm = stubClient(() => {
      called = true;
      return {};
    });
    const engine = new RankingEngineService(llm);

    const ranked = await engine.rankAndExplain(
      [],
      { detectedFoods: [], detectedComponents: {} },
      {},
      {},
    );
    expect(ranked).toEqual([]);
    expect(called).toBe(false);
  });

  it('joins LLM rankings back onto real candidates, sorted best-first', async () => {
    const llm = stubClient(() => ({
      rankedCandidates: [
        {
          candidateId: spinach.id,
          overallScore: 0.9,
          reasoning: 'covers more gaps',
          explanation: 'Add spinach too!',
        },
        { candidateId: egg.id, overallScore: 0.8, reasoning: 'simple', explanation: 'Add an egg.' },
      ],
      rankingConfidence: 0.9,
    }));
    const engine = new RankingEngineService(llm);

    const ranked = await engine.rankAndExplain(
      candidates,
      {
        detectedFoods: [{ name: 'instant noodles' }],
        detectedComponents: { protein: false, fiber_sources: false },
      },
      {},
      {},
    );

    expect(ranked[0]!.candidate.id).toBe(spinach.id);
    expect(ranked[0]!.naturalLanguageExplanation).toBe('Add spinach too!');
    expect(ranked).toHaveLength(2);
  });

  it('repairs model output: drops invented ids, re-inserts omitted candidates', async () => {
    const llm = stubClient(() => ({
      rankedCandidates: [
        { candidateId: 'invented-id', overallScore: 0.99, reasoning: '', explanation: '' },
        { candidateId: egg.id, overallScore: 0.7, reasoning: 'ok', explanation: 'Add an egg.' },
      ],
      rankingConfidence: 0.5,
    }));
    const engine = new RankingEngineService(llm);

    const ranked = await engine.rankAndExplain(
      candidates,
      {
        detectedFoods: [],
        detectedComponents: {},
      },
      {},
      {},
    );

    expect(ranked.map((entry) => entry.candidate.id).sort()).toEqual([egg.id, spinach.id].sort());
    expect(ranked.find((entry) => entry.candidate.id === spinach.id)!.rankScore).toBe(0.5);
  });

  it('falls back to deterministic scoring when the provider fails', async () => {
    let calls = 0;
    const failingThenHeuristic: LlmClient = {
      versionLabel: 'failing',
      async completeJson<T>(_options: CompleteJsonOptions<T>) {
        calls++;
        throw new Error('provider down');
      },
    };
    const engine = new RankingEngineService(failingThenHeuristic);

    const ranked = await engine.rankAndExplain(
      candidates,
      {
        detectedFoods: [{ name: 'instant noodles' }],
        detectedComponents: { protein: false, fiber_sources: false },
      },
      {},
      {},
    );

    expect(ranked).toHaveLength(2);
    expect(ranked.every((entry) => entry.naturalLanguageExplanation.length > 10)).toBe(true);
    // The primary client was attempted; fallback produced results anyway.
    expect(calls).toBe(1);
  });

  it('validates its own schema contract', () => {
    const schema: ZodType<unknown, ZodTypeDef, unknown> = rankingResultSchema;
    const parsed = schema.parse({
      rankedCandidates: [{ candidateId: 'x', overallScore: 2.0, reasoning: '', explanation: '' }],
      rankingConfidence: 0.4,
    });
    // .catch() clamps out-of-range scores instead of rejecting the whole
    // response - a resilient contract for noisy model output.
    expect(
      (parsed as { rankedCandidates: Array<{ overallScore: number }> }).rankedCandidates[0]!
        .overallScore,
    ).toBe(0.5);
  });
});
