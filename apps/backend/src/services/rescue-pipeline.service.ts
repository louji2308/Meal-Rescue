/**
 * Rescue pipeline - the full funnel from implementation plan step 2.7:
 *
 *   meal (already analyzed) -> candidates -> deterministic constraints
 *     -> LLM ranking + explanations -> safety validation -> top pick
 *     + up to 2 alternatives -> persist Rescue record.
 *
 * Product rules enforced here (product vision doc):
 * - THREE choices maximum, never a list of 25 recipes
 * - Response carries exactly the four actions the UI offers
 * - No feasible candidate => structured CONSTRAINT_CONFLICT, not a
 *   garbage suggestion
 */
import { randomUUID } from 'node:crypto';

import type {
  Constraints,
  CulinaryFamily,
  DetectedFood,
  DetectedIngredient,
  RankedRecommendation,
  RescueCandidate,
  RescueGenerateResponse,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import { Meal } from '../database/models/meal.model';
import { Rescue } from '../database/models/rescue.model';
import { AppError } from '../lib/errors';
import type { LlmClient } from './ai/llm-client';
import { CandidateGeneratorService } from './candidate-generator.service';
import { ConstraintEngineService } from './constraint-engine.service';
import type { MealCompletionService } from './meal-completion.service';
import { RankingEngineService } from './ranking-engine.service';
import { additionsFromRescues, deriveMealGroup } from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';
import { TasteMemoryService } from './taste-memory.service';
import { ValidationService } from './validation.service';

const MAX_ALTERNATIVES = 2; // 1 recommendation + 2 alternatives = 3 choices
const RECENT_RESCUES_LIMIT = 10; // anti-fatigue window (spec §8, soft/decaying)

export interface PantryProvider {
  /** User's pantry item names; empty when pantry tracking is unused. */
  getPantryItemNames(userId: string): Promise<string[]>;
  /** Full pantry rows for advanced features (expiry, quantity, priority). */
  getFullPantry(userId: string): Promise<Array<Record<string, unknown>>>;
}

export class RescuePipelineService {
  private readonly generator: CandidateGeneratorService;
  private readonly constraintEngine: ConstraintEngineService;
  private readonly rankingEngine: RankingEngineService;
  private readonly validation: ValidationService;
  private readonly tasteMemory: TasteMemoryService | null;
  private readonly mealCompletion: MealCompletionService | null;

  constructor(
    llm: LlmClient,
    private readonly pantryProvider: PantryProvider | null,
    tasteMemory?: TasteMemoryService,
    mealCompletion?: MealCompletionService,
  ) {
    this.generator = new CandidateGeneratorService();
    this.constraintEngine = new ConstraintEngineService();
    this.rankingEngine = new RankingEngineService(llm);
    this.validation = new ValidationService();
    this.tasteMemory = tasteMemory ?? null;
    this.mealCompletion = mealCompletion ?? null;
  }

  async generateRescue(
    mealId: string,
    userId: string,
    constraints: Constraints,
  ): Promise<RescueGenerateResponse> {
    const startedAt = Date.now();

    const meal = await Meal.findOne({ where: { id: mealId, userId } });
    if (!meal) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'MEAL_NOT_FOUND',
        message: 'Meal not found. Analyze the meal first.',
        statusCode: 404,
        recoverable: true,
        suggestedAction: 'Capture the meal with /meals/analyze first',
      });
    }

    const detectedFoods = meal.detectedFoods as DetectedFood[];
    const detectedIngredients = meal.detectedIngredients as DetectedIngredient[];
    const detectedComponents = meal.detectedComponents as Record<string, boolean>;

    const preferences = await this.loadPreferences(userId);
    const pantry = this.pantryProvider ? await this.pantryProvider.getPantryItemNames(userId) : [];

    const culture = this.tasteMemory
      ? {
          affinities: (await this.tasteMemory.getCuisineAffinities(userId)) as Map<
            CulinaryFamily,
            number
          >,
          traditionVsModern: await this.tasteMemory.getTraditionVsModern(userId),
        }
      : undefined;

    // 1. Generate diverse candidates
    const rawCandidates = this.generator.generateCandidates(
      detectedFoods,
      detectedIngredients,
      detectedComponents,
      constraints,
      preferences,
      pantry,
      culture,
    );

    // 2. Deterministic constraint filtering (allergies = hard)
    const feasible = this.constraintEngine.filterCandidates(rawCandidates, constraints, pantry);

    if (feasible.length === 0) {
      throw new AppError({
        category: ErrorCategory.CONSTRAINT_CONFLICT,
        code: 'NO_FEASIBLE_CANDIDATES',
        message: 'No rescue options fit these constraints',
        statusCode: 422,
        recoverable: true,
        suggestedAction: 'Try relaxing time, budget, or the no-cooking filter',
      });
    }

    // 3. Ranking + explanations (LLM, deterministic fallback inside)
    const resonanceMemory = this.tasteMemory
      ? await this.tasteMemory.findResonanceMemory(userId, feasible)
      : undefined;

    const profile: RankingProfileInput | undefined = this.mealCompletion
      ? {
          ...(await this.mealCompletion.getRankingInputs(userId)),
          mealGroup: deriveMealGroup(detectedFoods.map((food) => food.name)),
        }
      : undefined;

    const recentlyShown = await this.recentlyShownAdditions(userId);

    const ranked = await this.rankingEngine.rankAndExplain(
      feasible,
      { detectedFoods, detectedComponents },
      constraints,
      preferences,
      resonanceMemory,
      profile ?? null,
      recentlyShown,
    );

    // 4. Safety validation - drop anything invalid, keep going
    const valid: RankedRecommendation[] = [];
    for (const recommendation of ranked) {
      const verdict = this.validation.validateRecommendation(
        recommendation,
        constraints,
        preferences,
        pantry,
      );
      if (verdict.valid) {
        valid.push(recommendation);
      }
      if (valid.length >= MAX_ALTERNATIVES + 1) break;
    }

    if (valid.length === 0 || !valid[0]) {
      throw new AppError({
        category: ErrorCategory.CONSTRAINT_CONFLICT,
        code: 'NO_SAFE_CANDIDATES',
        message: 'No rescue options passed safety checks',
        statusCode: 422,
        recoverable: true,
        suggestedAction: 'Try different constraints or capture the meal again',
      });
    }

    const recommendation = valid[0];
    const alternatives = valid.slice(1, MAX_ALTERNATIVES + 1);
    const processingTimeMs = Date.now() - startedAt;

    // 5. Persist the rescue record (learning loop input for Phase 4)
    const rescueId = randomUUID();
    await Rescue.create({
      id: rescueId,
      mealId,
      userId,
      originalMeal: { foods: detectedFoods.map((food) => food.name) },
      detectedIngredients,
      constraints,
      candidatesGenerated: { feasible, rankedCount: ranked.length },
      selectedRecommendation: recommendation,
      reasoning: recommendation.reasoning,
      userDecision: 'pending',
      processingTimeMs,
      modelVersion: 'pipeline:v2',
    });

    return {
      rescueId,
      originalMeal: { mealId, foods: detectedFoods.map((food) => food.name) },
      recommendation,
      alternatives,
      actions: ['rescue', 'swap', 'dont_have', 'keep_as_is'],
    };
  }

  /** Addition names recommended in the last rescues - the anti-fatigue input. */
  private async recentlyShownAdditions(userId: string): Promise<string[]> {
    const rescues = await Rescue.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: RECENT_RESCUES_LIMIT,
    });
    return additionsFromRescues(
      rescues.map((row) => ({ selectedRecommendation: row.get('selectedRecommendation') })),
    );
  }

  private async loadPreferences(
    userId: string,
  ): Promise<{ favoriteFoods?: string[]; avoidedFoods?: string[] }> {
    if (!this.tasteMemory) return {};
    return this.tasteMemory.buildPreferenceSnapshot(userId);
  }
}

// Re-exported for route wiring convenience.
export type { RescueCandidate };
