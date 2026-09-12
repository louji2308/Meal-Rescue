import { describe, expect, it } from '@jest/globals';

import type { SharedMealPlan } from '@meal-rescue/shared-types';

import type { LlmClient } from '../src/services/ai/llm-client';
import { CommonTableAiService } from '../src/services/common-table/common-table-ai.service';

function stubLlm(baseName: string, description: string): LlmClient {
  return {
    versionLabel: 'stub',
    async completeJson<T>() {
      return { data: { baseName, description } as T, usage: null };
    },
  };
}

function plan(): SharedMealPlan {
  return {
    baseName: 'Rotisserie Chicken & Broccoli Rice Bowl',
    baseDescription: 'One base — everyone finishes their own plate.',
    estimatedMinutes: 18,
    effort: 'medium',
    equipment: ['pan', 'pot'],
    sharedSteps: [{ title: 'Cook the rice', minutes: 12 }],
    splitPointIndex: 1,
    branchSteps: [],
    finishes: [],
    ingredients: ['rotisserie chicken', 'rice', 'broccoli'],
    excludedIngredients: ['peanuts', 'peanut butter'],
  };
}

describe('CommonTableAiService — AI can never override safety', () => {
  it('rejects an LLM-proposed name that mentions a blocked ingredient', async () => {
    const service = new CommonTableAiService(
      stubLlm('Peanut Butter & Banana Wrap', 'Rich, creamy and quick.'),
      true,
    );
    const polished = await service.polish(plan());

    // The blocked ingredient surfaces nowhere — the deterministic name wins.
    expect(polished.baseName).toBe('Rotisserie Chicken & Broccoli Rice Bowl');
    expect(polished.baseName.toLowerCase()).not.toContain('peanut');
  });

  it('adopts a safe LLM polish that adds no new ingredients', async () => {
    const service = new CommonTableAiService(
      stubLlm('Golden Chicken Bowl', 'Warm, cozy, weeknight-simple.'),
      true,
    );
    const polished = await service.polish(plan());

    expect(polished.baseName).toBe('Golden Chicken Bowl');
    expect(polished.baseDescription).toBe('Warm, cozy, weeknight-simple.');
    // The ingredient set is fixed by the deterministic engine.
    expect(polished.ingredients).toEqual(plan().ingredients);
  });
});
