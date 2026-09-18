import { z } from 'zod';

import type { SharedMealPlan } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import type { LlmClient } from '../ai/llm-client';
import type { MemberTasteContext } from './household-constraint.service';
import { HouseholdConstraintService } from './household-constraint.service';

// ---------------------------------------------------------------------------
// Schema for full AI meal plan generation
// ---------------------------------------------------------------------------

const cookingStepSchema = z.object({
  title: z.string().min(1).max(120),
  minutes: z.number().min(1).max(120),
});

const finishSchema = z.object({
  memberId: z.string().uuid(),
  memberName: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  additions: z.array(z.string().min(1).max(80)).max(5),
  notes: z.string().max(200).optional(),
});

const planMealSchema = z.object({
  baseName: z.string().min(1).max(120),
  baseDescription: z.string().min(1).max(400),
  estimatedMinutes: z.number().min(1).max(120),
  effort: z.enum(['low', 'medium', 'high']),
  equipment: z.array(z.string().max(60)).max(10),
  sharedSteps: z.array(cookingStepSchema).min(1).max(20),
  branchSteps: z.array(cookingStepSchema).max(10),
  finishes: z.array(finishSchema).min(1).max(10),
  ingredients: z.array(z.string().min(1).max(80)).min(2).max(20),
  excludedIngredients: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Polish schema (existing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full meal plan prompt
// ---------------------------------------------------------------------------

function buildPlanPrompt(members: MemberTasteContext[], ingredients: string[], effort: string, timeMinutes?: number): {
  systemPrompt: string;
  userContent: string;
} {
  const memberSummaries = members.map((m) => {
    const parts = [`  - ${m.displayName} (${m.relationship})`];
    if (m.allergies.length > 0) parts.push(`    ALLERGIES: ${m.allergies.join(', ')}`);
    if (m.dietaryRestrictions.length > 0) parts.push(`    DIET: ${m.dietaryRestrictions.join(', ')}`);
    if (m.avoidIngredients.length > 0) parts.push(`    AVOID: ${m.avoidIngredients.join(', ')}`);
    if (m.likes.length > 0) parts.push(`    LIKES: ${m.likes.join(', ')}`);
    if (m.dislikes.length > 0) parts.push(`    DISLIKES: ${m.dislikes.join(', ')}`);
    if (m.spiceLevel) parts.push(`    SPICE: ${m.spiceLevel}`);
    if (m.textures.length > 0) parts.push(`    TEXTURES: ${m.textures.join(', ')}`);
    return parts.join('\n');
  });

  const systemPrompt = `You are a family meal planner. Generate a single shared meal that EVERY household member can eat safely.

CRITICAL SAFETY RULES:
- NEVER include an ingredient that appears in any member's ALLERGIES or AVOID list.
- NEVER use pork, shellfish, or common allergens (nuts, dairy, gluten, soy, eggs, fish) unless explicitly listed as available ingredients AND no member is allergic.
- When in doubt, omit the ingredient. Safety over creativity.
- Every member's dietary restrictions MUST be respected.

GENERATION RULES:
- The meal must be a single shared base that everyone eats together.
- At the split point, each member gets a personalized finish (additions/seasoning) that suits their taste.
- Steps BEFORE the split point are shared (everyone eats the same thing).
- Steps AFTER the split point are per-member branches.
- Each step must have a title and estimated minutes (1-120).
- Each finish must reference a real member by memberId and name.
- Equipment should be practical (pan, pot, oven, knife, etc.).
- Ingredients must be common grocery items — no specialty or hard-to-find items.
- Estimated total time should be realistic (5-90 minutes).

RESPOND ONLY WITH VALID JSON matching this structure:
{
  "baseName": "A warm, appetizing meal name (under 60 chars)",
  "baseDescription": "One sentence describing the meal vibe",
  "estimatedMinutes": number,
  "effort": "low" | "medium" | "high",
  "equipment": ["pan", "pot"],
  "sharedSteps": [{"title": "...", "minutes": number}],
  "branchSteps": [{"title": "...", "minutes": number}],
  "finishes": [{"memberId": "...", "memberName": "...", "title": "...", "additions": ["..."], "notes": "..."}],
  "ingredients": ["ingredient1", "ingredient2"]
}`;

  const timeHint = timeMinutes ? ` Target time: ${timeMinutes} minutes.` : '';
  const userContent = `Household members:\n${memberSummaries.join('\n')}\n\nAvailable ingredients: ${ingredients.join(', ')}\nEffort level: ${effort}.${timeHint}\n\nGenerate a shared meal plan.`;

  return { systemPrompt, userContent };
}

/**
 * AI-powered meal planner. Generates a full SharedMealPlan from scratch,
 * then validates it against member safety constraints. Any unsafe ingredient
 * is stripped — if stripping breaks the plan, the caller falls back to the
 * deterministic engine.
 */
export class CommonTableAiService {
  private readonly constraints = new HouseholdConstraintService();

  constructor(
    private readonly llm: LlmClient,
    private readonly enabled: boolean = Boolean(env.OPENAI_API_KEY),
  ) {}

  /**
   * Generate a full meal plan via AI. Returns null if the AI is unavailable,
   * fails, or produces an unsafe plan.
   */
  async planMeal(
    members: MemberTasteContext[],
    ingredients: string[],
    effort: string,
    timeMinutes?: number,
  ): Promise<SharedMealPlan | null> {
    if (!this.enabled || !this.llm) return null;
    if (members.length === 0 || ingredients.length === 0) return null;

    try {
      const { systemPrompt, userContent } = buildPlanPrompt(members, ingredients, effort, timeMinutes);

      const { data } = await this.llm.completeJson({
        systemPrompt,
        userContent,
        schema: planMealSchema,
        modelName: env.OPENAI_TEXT_MODEL,
        maxTokens: 2000,
      });

      // Safety gate: validate every ingredient against every member
      const safety = this.constraints.sharedSafeIngredients(data.ingredients, members);
      const blockedNames = new Set(safety.blocked.map((b) => b.ingredient));

      // If ANY ingredient is unsafe, strip it and see if the plan survives
      const safeIngredients = data.ingredients.filter((ing) => !blockedNames.has(ing));
      if (safeIngredients.length < 2) return null; // Plan is unsalvageable

      // Strip unsafe finishes (finishes that reference blocked ingredients)
      const safeFinishes = data.finishes.map((f) => ({
        ...f,
        id: `${f.memberId}-${Math.floor(Math.random() * 100000)}`,
        additions: f.additions.filter((a) => !blockedNames.has(a)),
      }));

      // Ensure splitPointIndex is valid
      const splitPointIndex = Math.min(data.sharedSteps.length, data.sharedSteps.length);

      return {
        baseName: data.baseName,
        baseDescription: data.baseDescription,
        estimatedMinutes: data.estimatedMinutes,
        effort: data.effort,
        equipment: data.equipment,
        sharedSteps: data.sharedSteps,
        splitPointIndex,
        branchSteps: data.branchSteps,
        finishes: safeFinishes,
        ingredients: safeIngredients,
        excludedIngredients: [...new Set([...(data.excludedIngredients ?? []), ...blockedNames])],
      };
    } catch {
      return null;
    }
  }

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
