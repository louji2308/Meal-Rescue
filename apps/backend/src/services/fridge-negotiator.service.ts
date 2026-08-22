import type {
  BudgetLevel,
  Constraints,
  FridgeNegotiateRequest,
  FridgeNegotiateResponse,
  HungerLevel,
  MealRecommendation,
} from '@meal-rescue/shared-types';

import { IngredientRecord, findBestMatch } from './ai/ingredient-db';
import { createLlmClient } from './ai/llm-factory';
import { reasoningSchema } from './ai/llm-schemas';
import type { UserPreferenceSnapshot } from './candidate-generator.service';
import { CandidateGeneratorService } from './candidate-generator.service';
import { ConstraintEngineService } from './constraint-engine.service';
import { RankingEngineService } from './ranking-engine.service';

/**
 * FridgeNegotiatorService - "I'm hungry, here's what I have"
 *
 * Takes available ingredients + time + hunger level, returns up to 3
 * complete meal recommendations with missing ingredients listed.
 * Reuses the candidate generator + constraint engine + ranking pipeline.
 */
export class FridgeNegotiatorService {
  private readonly generator = new CandidateGeneratorService();
  private readonly constraintEngine = new ConstraintEngineService();
  private readonly rankingEngine = new RankingEngineService(createLlmClient());
  private readonly llm = createLlmClient();

  async negotiate(request: FridgeNegotiateRequest): Promise<FridgeNegotiateResponse> {
    const { availableIngredients, timeMinutes, hungerLevel, userId: _userId } = request;

    // Normalize ingredients to known KB entries
    const matchedIngredients = availableIngredients
      .map((name) => findBestMatch(name))
      .filter((m): m is IngredientRecord => m !== null);

    const matchedNames = matchedIngredients.map((m) => m.name);

    // Build constraints from request
    const constraints: Constraints = {
      timeMinutes,
      cookingRequired: timeMinutes > 5,
      budget: 'medium' as BudgetLevel,
    };

    // Generate candidates using the ingredients as "detected"
    const detectedFoods = matchedNames.map((name) => ({ name, confidence: 1 }));
    const detectedIngredients = matchedIngredients.map((m) => ({
      name: m.name,
      confidence: 1,
      state: 'raw' as const,
    }));

    const components = matchedIngredients.reduce(
      (acc, m) => {
        if (m.components.includes('protein')) acc.protein = true;
        if (m.components.includes('fiber_sources')) acc.fiber_sources = true;
        if (m.components.includes('healthy_fat_sources')) acc.healthy_fat_sources = true;
        if (m.components.includes('carbohydrates')) acc.carbohydrates = true;
        return acc;
      },
      { protein: false, fiber_sources: false, healthy_fat_sources: false, carbohydrates: false },
    );

    // Generate candidates with the available ingredients as base
    const emptyPrefs: UserPreferenceSnapshot = {};
    const candidates = this.generator.generateCandidates(
      detectedFoods,
      detectedIngredients,
      components,
      constraints,
      emptyPrefs,
      matchedNames, // pantry = available ingredients
    );

    // Filter and rank
    const filtered = this.constraintEngine.filterCandidates(candidates, constraints, matchedNames);
    const ranked = await this.rankingEngine.rankAndExplain(
      filtered,
      {
        detectedFoods: detectedFoods.map((f) => ({ name: f.name })),
        detectedComponents: components,
      },
      constraints,
      emptyPrefs,
    );

    // Take top 3 and convert to MealRecommendation format
    const top3 = ranked.slice(0, 3);
    const recommendations = top3.map((entry) =>
      this.toMealRecommendation(entry.candidate, matchedNames),
    );
    const allMissing = [...new Set(recommendations.flatMap((r) => r.missingIngredients))];

    // Generate reasoning via LLM
    const reasoning = await this.generateReasoning(
      matchedNames,
      hungerLevel,
      timeMinutes,
      recommendations,
    );

    return {
      recommendations,
      reasoning,
      missingIngredients: allMissing,
    };
  }

  private toMealRecommendation(
    candidate: {
      additions: Array<{ name: string }>;
      substitutions: Array<{ original: { name: string }; replacement: { name: string } }>;
      estimatedTime: number;
      cookingSteps: number;
      requiredEquipment: string[];
    },
    pantry: string[],
  ): MealRecommendation {
    const allIngredients = [
      ...candidate.additions.map((a) => a.name),
      ...candidate.substitutions.map((s) => s.replacement.name),
    ];
    const missing = allIngredients.filter(
      (name) => !pantry.some((p) => p.toLowerCase() === name.toLowerCase()),
    );
    const usesPantry = allIngredients.filter((name) =>
      pantry.some((p) => p.toLowerCase() === name.toLowerCase()),
    );
    const effort =
      candidate.cookingSteps === 0 ? 'low' : candidate.cookingSteps <= 2 ? 'medium' : 'high';

    return {
      name: this.generateMealName(candidate),
      ingredients: allIngredients,
      instructions: this.generateInstructions(candidate),
      estimatedTimeMinutes: candidate.estimatedTime,
      effort,
      missingIngredients: missing,
      usesPantryItems: usesPantry,
    };
  }

  private generateMealName(candidate: {
    additions: Array<{ name: string }>;
    substitutions: Array<{ original: { name: string }; replacement: { name: string } }>;
  }): string {
    const parts: string[] = [];
    if (candidate.additions.length > 0) {
      parts.push(candidate.additions.map((a) => a.name).join(' + '));
    }
    if (candidate.substitutions.length > 0) {
      parts.push(
        candidate.substitutions.map((s) => `${s.original.name}→${s.replacement.name}`).join(', '),
      );
    }
    return parts.length > 0 ? parts.join(' with ') : 'Simple meal';
  }

  private generateInstructions(candidate: {
    additions: Array<{ name: string }>;
    cookingSteps: number;
  }): string[] {
    const steps: string[] = [];
    if (candidate.additions.length > 0) {
      steps.push(`Prepare: ${candidate.additions.map((a) => a.name).join(', ')}`);
    }
    if (candidate.cookingSteps > 0) {
      steps.push('Cook according to your preferred method');
    }
    steps.push('Combine and enjoy!');
    return steps;
  }

  private async generateReasoning(
    available: string[],
    hungerLevel: HungerLevel | undefined,
    timeMinutes: number,
    recommendations: MealRecommendation[],
  ): Promise<string> {
    const userContent = `User has: ${available.join(', ')}. Time: ${timeMinutes}min. Hunger: ${hungerLevel ?? 'meal'}.
Generated ${recommendations.length} meals. Write a brief, friendly explanation of why these work well.`;

    try {
      const result = await this.llm.completeJson<{ reasoning: string }>({
        systemPrompt:
          'You are a helpful meal planning assistant. Write brief, friendly explanations.',
        userContent,
        schema: reasoningSchema,
        modelName: 'fridge-negotiator-reasoning',
      });
      return result.data.reasoning || 'These meals make great use of what you have on hand.';
    } catch {
      return `Found ${recommendations.length} meals using your ingredients. Perfect for a ${hungerLevel ?? 'meal'} in ${timeMinutes} minutes.`;
    }
  }
}
