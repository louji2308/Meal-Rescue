import { describe, expect, it } from '@jest/globals';

import type { IntentResolution } from '@meal-rescue/shared-types';

import type { LlmClient } from '../../src/services/ai/llm-client';
import { MealMemoryAiService } from '../../src/services/meal-memory/meal-memory-ai.service';

function baseResolution(): IntentResolution {
  return {
    intent: 'SCHEDULE',
    confidence: 0.6,
    confidenceBand: 'LOW',
    rawText: 'make pasta friday',
    entities: {
      mealConcept: 'pasta',
      targetDate: null,
      targetHorizon: null,
      mealSlot: 'dinner',
      excludedDay: null,
      ingredient: null,
      memberId: null,
      blockType: null,
      effort: null,
      constraint: null,
      moveTarget: null,
    },
    requiresClarification: false,
    clarificationQuestion: null,
  };
}

function llmReturning(data: unknown): LlmClient {
  return {
    versionLabel: 'test:v1',
    completeJson: async () => ({ data, usage: {} as never }),
  } as unknown as LlmClient;
}

describe('MealMemoryAiService.refineIntent validation', () => {
  it('neutralizes a hallucinated calendar date (Feb 30)', async () => {
    const service = new MealMemoryAiService(
      llmReturning({
        intent: 'SCHEDULE',
        confidence: 0.9,
        mealConcept: 'pasta',
        targetDate: '2026-02-30',
      }),
    );
    const refined = await service.refineIntent(baseResolution(), 'make pasta friday');
    expect(refined.entities.targetDate).toBeNull();
    expect(refined.confidence).toBe(0.9);
    expect(refined.confidenceBand).toBe('HIGH');
  });

  it('accepts a well-formed date as-is', async () => {
    const service = new MealMemoryAiService(
      llmReturning({
        intent: 'SCHEDULE',
        confidence: 0.9,
        mealConcept: 'pasta',
        targetDate: '2026-09-18',
      }),
    );
    const refined = await service.refineIntent(baseResolution(), 'make pasta friday');
    expect(refined.entities.targetDate).toBe('2026-09-18');
  });

  it('neutralizes a non-ISO date string', async () => {
    const service = new MealMemoryAiService(
      llmReturning({
        intent: 'SCHEDULE',
        confidence: 0.9,
        mealConcept: 'pasta',
        targetDate: '2026/09/18',
      }),
    );
    const refined = await service.refineIntent(baseResolution(), 'make pasta friday');
    expect(refined.entities.targetDate).toBeNull();
  });

  it('neutralizes concepts with runaway whitespace or excessive length', async () => {
    const service = new MealMemoryAiService(
      llmReturning({
        intent: 'SCHEDULE',
        confidence: 0.9,
        mealConcept: 'oven   roasted   chimichurri   salmon',
        targetDate: null,
      }),
    );
    const refined = await service.refineIntent(baseResolution(), 'make pasta friday');
    expect(refined.entities.mealConcept).toBe('pasta');

    const long = new MealMemoryAiService(
      llmReturning({
        intent: 'SCHEDULE',
        confidence: 0.9,
        mealConcept: 'x'.repeat(200),
        targetDate: null,
      }),
    );
    const refinedLong = await long.refineIntent(baseResolution(), 'make pasta friday');
    expect(refinedLong.entities.mealConcept).toBe('pasta');
  });

  it('falls back to the deterministic resolution when the provider errors', async () => {
    const service = new MealMemoryAiService({
      versionLabel: 'test:v1',
      completeJson: async () => {
        throw new Error('provider down');
      },
    } as unknown as LlmClient);
    const refined = await service.refineIntent(baseResolution(), 'make pasta friday');
    expect(refined.entities.targetDate).toBeNull();
    expect(refined.entities.mealConcept).toBe('pasta');
    expect(refined.confidence).toBe(0.6);
  });
});