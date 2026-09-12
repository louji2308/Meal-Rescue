/**
 * MealMemoryAiService — optional LLM refinement over the deterministic core.
 *
 * The deterministic pipeline is complete on its own (classifier + planner are
 * the decision-makers and always run). This service is a thin polish layer:
 *   - refineIntent: may raise confidence / confirm entity extraction
 *   - polishPlan: may rewrite meal concept strings to nicer names
 * When no key is configured, or the provider fails, every method is a
 * pass-through — identical results, no network required. This keeps CI and
 * tests deterministic.
 */
import { z } from 'zod';

import type { IntentResolution, PlanningResult } from '@meal-rescue/shared-types';

import type { LlmClient } from '../ai/llm-client';

const intentPolishSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  mealConcept: z.string().nullable(),
  mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullable().optional(),
  ingredient: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});

const planPolishSchema = z.object({
  meals: z.array(
    z.object({
      id: z.string(),
      concept: z.string().min(1).max(160),
    }),
  ),
});

export class MealMemoryAiService {
  private readonly llm: LlmClient;
  private readonly enabled: boolean;

  constructor(llm: LlmClient) {
    this.llm = llm;
    this.enabled = llm.versionLabel !== 'heuristic:v1';
  }

  async refineIntent(resolution: IntentResolution, _text: string): Promise<IntentResolution> {
    if (!this.enabled) return resolution;
    try {
      const { data } = await this.llm.completeJson({
        systemPrompt:
          'You are the entity-resolution half of a household food agent. ' +
          'Given the deterministic classification below, correct only clear extraction ' +
          'errors. Never change the intent. Confidence should reflect how sure you are.',
        userContent: {
          classifiedIntent: resolution.intent,
          confidence: resolution.confidence,
          entities: resolution.entities,
        },
        schema: intentPolishSchema,
        modelName: 'meal-memory-intent-polish',
        maxTokens: 300,
      });

      return {
        ...resolution,
        confidence:
          data.confidence >= 0.5 && data.confidence <= 1 ? data.confidence : resolution.confidence,
        confidenceBand:
          data.confidence >= 0.75 ? 'HIGH' : data.confidence >= 0.5 ? 'MEDIUM' : 'LOW',
        entities: {
          ...resolution.entities,
          mealConcept: pick(data.mealConcept, resolution.entities.mealConcept),
          mealSlot: pick(data.mealSlot ?? null, resolution.entities.mealSlot),
          ingredient: pick(data.ingredient ?? null, resolution.entities.ingredient),
          targetDate: pick(data.targetDate ?? null, resolution.entities.targetDate),
        },
      };
    } catch {
      return resolution;
    }
  }

  async polishPlan(result: PlanningResult): Promise<PlanningResult> {
    if (!this.enabled || !result.plan || result.plan.meals.length === 0) return result;

    try {
      const { data } = await this.llm.completeJson({
        systemPrompt:
          'Rewrite these meal names to be short, appetizing, and family-friendly. ' +
          'Keep each concept under 40 characters. Preserve ids exactly.',
        userContent: {
          meals: result.plan.meals.map((m) => ({ id: m.id, concept: m.concept })),
        },
        schema: planPolishSchema,
        modelName: 'meal-memory-plan-polish',
        maxTokens: 400,
      });

      const byId = new Map(data.meals.map((m) => [m.id, m.concept]));
      return {
        ...result,
        plan: {
          ...result.plan,
          meals: result.plan.meals.map((m) =>
            byId.has(m.id) ? { ...m, concept: byId.get(m.id)! } : m,
          ),
        },
      };
    } catch {
      return result;
    }
  }
}

function pick<T>(candidate: T | null | undefined, fallback: T | null): T | null {
  return candidate == null || candidate === '' ? fallback : candidate;
}
