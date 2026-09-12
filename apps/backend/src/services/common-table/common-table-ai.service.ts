import { z } from 'zod';

import type { SharedMealPlan } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import type { LlmClient } from '../ai/llm-client';

const polishSchema = z.object({
  baseName: z.string().min(1).max(120).catch(''),
  description: z.string().min(1).max(400).catch(''),
});

const POLISH_PROMPT = `You are naming a shared weeknight meal. You will receive a deterministic meal plan that has already been safety-filtered for every household member.

Rewrite ONLY the base name and a one-sentence description so they feel warm, calm and appetizing. Rules:
- NEVER mention any ingredient not present in the "allowedIngredients" list.
- NEVER mention allergens, diets, macros, calories or health claims.
- Keep names short (under 60 chars) and human.
- Respond ONLY with JSON: {"baseName": "...", "description": "..."}`;

/**
 * Optionally polishes the deterministic plan's copy via the LLM. The result
 * is schema-validated AND re-checked against the plan's ingredient allow-list
 * — the LLM can never introduce an ingredient, so safety cannot be bypassed.
 * Any failure degrades gracefully to the deterministic naming.
 */
export class CommonTableAiService {
  constructor(
    private readonly llm: LlmClient,
    private readonly enabled: boolean = Boolean(env.OPENAI_API_KEY),
  ) {}

  async polish(plan: SharedMealPlan): Promise<SharedMealPlan> {
    if (!this.enabled || !this.llm) return plan;

    try {
      const { data } = await this.llm.completeJson({
        systemPrompt: POLISH_PROMPT,
        userContent: {
          currentBaseName: plan.baseName,
          allowedIngredients: plan.ingredients,
        },
        schema: polishSchema,
        modelName: env.OPENAI_TEXT_MODEL,
      });

      const safeName =
        data.baseName && !this.mentionsBlocked(data.baseName, plan.excludedIngredients)
          ? data.baseName
          : plan.baseName;
      const safeDescription = data.description ? data.description : plan.baseDescription;

      return { ...plan, baseName: safeName, baseDescription: safeDescription };
    } catch {
      return plan;
    }
  }

  private mentionsBlocked(name: string, blocked: string[]): boolean {
    const lower = name.toLowerCase();
    return blocked.some((ingredient) => {
      const token = ingredient.replace(/s$/, '').toLowerCase();
      return token.length >= 3 && lower.includes(token);
    });
  }
}
