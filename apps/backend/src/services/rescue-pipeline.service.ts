/**
 * Rescue pipeline - the full funnel from implementation plan step 2.7:
 *
 *   meal (already analyzed) -> candidates -> deterministic constraints
 *     -> LLM ranking + explanations -> safety validation -> top pick
 *     + up to 2 alternatives -> persist Rescue record.
 *
 * V2 (Shipaton 2026): a decision layer sits above candidate generation:
 *   Intent Resolver -> Reality Context -> Decision Engine -> Candidate
 *   Generator -> Constraint Engine -> Ranking -> Recommendation.
 *
 * Product rules enforced here (product vision doc):
 * - THREE choices maximum, never a list of 25 recipes
 * - Response carries exactly the four actions the UI offers
 * - No feasible candidate => structured CONSTRAINT_CONFLICT, not a
 *   garbage suggestion
 * - V2: reality is a HARD filter (never a ranking preference), the craving
 *   lock is never replaced, and every candidate carries decision metadata.
 */
import { randomUUID } from 'node:crypto';

import type {
  AIProvenance,
  Constraints,
  CulinaryFamily,
  DecisionAction,
  DetectedFood,
  DetectedIngredient,
  RankedRecommendation,
  RescueCandidate,
  RescueGenerateResponse,
  RescueGenerateV2ContextInput,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import { Meal } from '../database/models/meal.model';
import { Rescue } from '../database/models/rescue.model';
import { AppError } from '../lib/errors';
import type { LlmClient } from './ai/llm-client';
import { PROMPT_VERSIONS } from './ai/prompts';
import { CandidateGeneratorService } from './candidate-generator.service';
import { ConstraintEngineService } from './constraint-engine.service';
import type { MealCompletionService } from './meal-completion.service';
import { RankingEngineService } from './ranking-engine.service';
import { additionsFromRescues, deriveMealGroup } from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';
import { TasteMemoryService } from './taste-memory.service';
import { buildKeepAsIsCandidate, buildUseExpiringCandidate } from './v2/candidate-strategies';
import { applyCravingLock } from './v2/craving-lock';
import { decorateCandidate, pickWinnerAction, shapeForIntent } from './v2/decision-engine.service';
import { DecisionEventService } from './v2/decision-events.service';
import { resolveIntent } from './v2/intent-resolver';
import { deriveReality } from './v2/reality-context';
import { ValidationService } from './validation.service';

const MAX_ALTERNATIVES = 2; // 1 recommendation + 2 alternatives = 3 choices
const RECENT_RESCUES_LIMIT = 10; // anti-fatigue window (spec §8, soft/decaying)
const EXPIRY_WINDOW_MS = 48 * 3_600_000;

export const PIPELINE_VERSION = 'v2.1.0';

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
  private readonly eventWriter: DecisionEventService | null;

  constructor(
    private readonly llm: LlmClient,
    private readonly pantryProvider: PantryProvider | null,
    tasteMemory?: TasteMemoryService,
    mealCompletion?: MealCompletionService,
    events?: DecisionEventService,
  ) {
    this.generator = new CandidateGeneratorService();
    this.constraintEngine = new ConstraintEngineService();
    this.rankingEngine = new RankingEngineService(llm);
    this.validation = new ValidationService();
    this.tasteMemory = tasteMemory ?? null;
    this.mealCompletion = mealCompletion ?? null;
    // Null in unit tests that wire the pipeline without a DB; the event
    // stream is then skipped (composition passes the real service).
    this.eventWriter = events ?? null;
  }

  async generateRescue(
    mealId: string,
    userId: string,
    constraints: Constraints,
    v2?: RescueGenerateV2ContextInput,
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

    // ── V2 intent + reality (hard constraint conversion, §5/§8) ────────────
    const intent = resolveIntent(v2?.intent);
    const reality = deriveReality(constraints, v2?.reality);

    // No-events DB wiring stays optional: the pipeline runs standalone in unit
    // tests; the composition root passes the real service.
    const events = this.eventWriter;

    await events?.record({
      eventType: 'INTENT_SELECTED',
      userId,
      mealId,
      payload: { intent, reality: v2?.reality ?? null },
    });
    await events?.record({
      eventType: 'RESCUE_STARTED',
      userId,
      mealId,
      payload: { pipelineVersion: PIPELINE_VERSION, intent },
    });

    const preferences = await this.loadPreferences(userId);
    const pantry = this.pantryProvider ? await this.pantryProvider.getPantryItemNames(userId) : [];
    const expiringIngredients = this.pantryProvider
      ? await this.findExpiringIngredients(userId)
      : [];

    const culture = this.tasteMemory
      ? {
          affinities: (await this.tasteMemory.getCuisineAffinities(userId)) as Map<
            CulinaryFamily,
            number
          >,
          traditionVsModern: await this.tasteMemory.getTraditionVsModern(userId),
        }
      : undefined;

    // 1. Generate diverse candidates (reality-derived constraints already applied
    //    to generation: no-cook filters, budget filters, time budget).
    const rawCandidates = this.generator.generateCandidates(
      detectedFoods,
      detectedIngredients,
      detectedComponents,
      reality.constraints,
      preferences,
      pantry,
      culture,
    );

    // 2. V2 decision layer: craving lock, intent shaping, special strategies.
    const cravingLocked = applyCravingLock(rawCandidates, v2?.craving);
    const shaped = shapeForIntent(cravingLocked, intent, {
      intent,
      preferAvailableIngredients: reality.preferAvailableIngredients,
      cleanupEffortCeiling: reality.cleanupEffortCeiling,
      expiringIngredients,
      mealFoods: detectedFoods.map((food) => food.name),
      mealDetectedComponents: detectedComponents,
    });

    // KEEP_AS_IS ("don't fix my food") - injected when the meal already fits or
    // the user explicitly asked to preserve it, OR the meal is balanced.
    const mealIsBalanced = detectedComponents.protein && detectedComponents.fiber_sources;
    const injectKeepAsIs = intent === 'PRESERVE' || mealIsBalanced || shaped.length === 0;
    if (injectKeepAsIs) {
      const boost = intent === 'PRESERVE' && mealIsBalanced ? 0.97 : undefined;
      shaped.push(
        buildKeepAsIsCandidate(
          detectedFoods.map((food) => food.name),
          boost,
        ),
      );
    }

    // USE_EXPIRING - prioritize an expiring pantry ingredient (§16).
    for (const expiring of expiringIngredients) {
      const record = expiringMatchesMeal(expiring, detectedFoods);
      if (record) {
        shaped.push(
          buildUseExpiringCandidate(
            expiring,
            detectedFoods.map((food) => food.name),
            5,
            'LOW',
          ),
        );
      }
    }

    // Decorate EVERY candidate with V2 decision metadata (§10).
    const decorated = shaped.map((candidate) =>
      decorateCandidate(
        candidate,
        intent,
        true, // reality hard filters run next; survivors satisfy it by construction
        classifyAction(candidate, expiringIngredients, detectedFoods),
      ),
    );

    // 3. Deterministic constraint filtering (allergies + reality = hard).
    const feasible = this.constraintEngine.filterCandidates(decorated, reality.constraints, pantry);

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

    // 4. Ranking + explanations (LLM, deterministic fallback inside).
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

    const rankingTracking = { fallbackUsed: false };
    const ranked = await this.rankingEngine.rankAndExplain(
      feasible,
      { detectedFoods, detectedComponents },
      reality.constraints,
      preferences,
      resonanceMemory,
      profile ?? null,
      recentlyShown,
      rankingTracking,
    );

    // 5. Safety validation - drop anything invalid, keep going.
    const valid: RankedRecommendation[] = [];
    for (const recommendation of ranked) {
      const verdict = this.validation.validateRecommendation(
        recommendation,
        reality.constraints,
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
    const decision = pickWinnerAction(valid);

    const provenance: AIProvenance = this.buildProvenance(rankingTracking, processingTimeMs);

    // 6. Persist the rescue record (learning loop input for Phase 4).
    const rescueId = randomUUID();
    await Rescue.create({
      id: rescueId,
      mealId,
      userId,
      originalMeal: { foods: detectedFoods.map((food) => food.name) },
      detectedIngredients,
      constraints: reality.constraints,
      candidatesGenerated: { feasible, rankedCount: ranked.length },
      selectedRecommendation: recommendation,
      reasoning: recommendation.reasoning,
      userDecision: 'pending',
      processingTimeMs,
      modelVersion: 'pipeline:v2',
      intent,
      decisionAction: decision,
      v2Context: {
        reality: v2?.reality ?? null,
        craving: v2?.craving ?? null,
        expiringIngredients,
      },
      provenance,
    });

    await events?.record({
      eventType: 'RECOMMENDATION_PRESENTED',
      userId,
      mealId,
      rescueId,
      payload: { decision, candidateId: recommendation.candidate.id },
    });

    return {
      rescueId,
      originalMeal: { mealId, foods: detectedFoods.map((food) => food.name) },
      recommendation,
      alternatives,
      actions: ['rescue', 'swap', 'dont_have', 'keep_as_is'],
      decision,
      provenance,
    };
  }

  /** Real provenance values from the LLM client + pipeline constants. */
  private buildProvenance(
    rankingTracking: { fallbackUsed: boolean },
    processingTimeMs: number,
  ): AIProvenance {
    const provider = env.OPENAI_API_KEY ? 'openai' : 'heuristic';
    const model = env.OPENAI_API_KEY ? env.OPENAI_TEXT_MODEL : 'heuristic:v1';
    return {
      provider,
      model,
      promptVersion: PROMPT_VERSIONS.candidateRanking,
      pipelineVersion: PIPELINE_VERSION,
      rankingVersion: 'rank-v1',
      fallbackUsed: rankingTracking.fallbackUsed,
      processingTimeMs,
      validationOutcome: 'passed',
    };
  }

  /** Pantry rows expiring within the near window, by ingredient name. */
  private async findExpiringIngredients(userId: string): Promise<string[]> {
    if (!this.pantryProvider) return [];
    const rows = await this.pantryProvider.getFullPantry(userId);
    const now = Date.now();
    return rows
      .filter((row) => {
        const expiresAt = row.expiresAt ? new Date(String(row.expiresAt)).getTime() : null;
        return expiresAt !== null && expiresAt - now <= EXPIRY_WINDOW_MS && expiresAt >= now;
      })
      .map((row) => String(row.ingredientName))
      .filter(Boolean);
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

/** Deterministic action classification (§9 / §10). */
export function classifyAction(
  candidate: RescueCandidate,
  expiringIngredients: string[],
  detectedFoods: DetectedFood[],
): DecisionAction {
  const expiring = new Set(expiringIngredients.map((name) => name.toLowerCase()));
  const foodNames = new Set(detectedFoods.map((food) => food.name.toLowerCase()));
  const additionNames = candidate.additions.map((addition) => addition.name.toLowerCase());

  if (candidate.substitutions.length > 0) return 'RESCUE';
  if (additionNames.length === 0) return 'KEEP_AS_IS';
  if (additionNames.some((name) => expiring.has(name))) return 'USE_EXPIRING';
  if (additionNames.some((name) => foodNames.has(name))) return 'USE_LEFTOVER';
  if (additionNames.length > 1) return 'COMBINE';
  return 'ADD';
}

function expiringMatchesMeal(ingredient: string, detectedFoods: DetectedFood[]): boolean {
  const names = detectedFoods.map((food) => food.name.toLowerCase());
  // Expiring produce/protein typically pairs with any noodle/rice/bowl base.
  const base = names.find((name) => /noodle|rice|pasta|wrap|bread|bowl|potato/.test(name));
  return Boolean(base) || names.length > 0;
}

// Re-exported for route wiring convenience.
export type { RescueCandidate };
