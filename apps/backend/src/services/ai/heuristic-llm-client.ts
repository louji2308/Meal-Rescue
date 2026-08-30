/**
 * Deterministic no-network implementation of LlmClient.
 *
 * Serves two purposes:
 * 1. Dev/test/CI path when OPENAI_API_KEY is absent - the full pipeline
 *    runs end-to-end with identical contracts.
 * 2. Runtime fallback when the provider fails (architecture doc:
 *    "LLM ranking fails -> use deterministic scoring").
 *
 * Behavior notes:
 * - Vision "analysis" cannot be done without a model. Honest output is a
 *   low-confidence unknown-meal result whose uncertainty flag tells the
 *   client to ask the user for a text description - exactly the doc's
 *   degradation rule "Vision model fails -> fall back to text input".
 * - Text extraction uses alias matching against the ingredient DB.
 * - Ranking uses transparent weighted scoring; explanations come from
 *   short templates so tone stays consistent with the AI path.
 */
import type { ZodType } from 'zod';

import {
  COLD_START_WEIGHTS,
  SAFETY_GATE_THRESHOLD,
  SAFETY_PICK_BOOST,
  SAFETY_PICK_MAX_MINUTES,
  STRONG_AFFINITY,
  STRONG_MEAL_CONTEXT,
  STRONG_PRACTICALITY,
  STRONG_PREFERENCE_FLOOR,
  clamp01,
  factorAffinityForCandidate,
  familyBenefit,
  familyCounts,
  genericMealPrior,
  normalize,
  recencyPenalty,
  recentAppearances,
  roleClassForAddition,
  roleFamily,
} from '../ranking/cold-start-signals';
import type { OnboardingMealGroup, RankingProfileInput } from '../ranking/cold-start-signals';
import { INGREDIENTS, type IngredientRecord } from './ingredient-db';
import type { CompleteJsonOptions, CompleteJsonResult, LlmClient } from './llm-client';
import {
  type RankingResult,
  type TextExtractionResult,
  type VisionResult,
  rankingResultSchema,
  textExtractionSchema,
  visionResultSchema,
} from './llm-schemas';

export interface RankingPayload {
  missingComponents?: string[];
  candidates?: Array<{
    id: string;
    type?: string;
    additions?: Array<{ name: string }>;
    substitutions?: Array<{ original: { name: string }; replacement: { name: string } }>;
    estimatedTime?: number;
    cookingSteps?: number;
    nutritionalImprovement?: Record<string, string>;
    preferenceAlignment?: number;
  }>;
  /** Meal-completion cold-start + anti-fatigue inputs (Plan 3). */
  custom?: {
    mealGroup?: string;
    profile?: RankingProfileInput | null;
    recentlyShown?: string[];
  };
}

export class HeuristicLlmClient implements LlmClient {
  readonly versionLabel = 'heuristic:v1';

  async completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
    let data: unknown;

    if (options.schema === (visionResultSchema as ZodType<unknown>)) {
      data = this.visionFallback();
    } else if (options.schema === (textExtractionSchema as ZodType<unknown>)) {
      data = this.extractFromText(String(options.userContent));
    } else if (options.schema === (rankingResultSchema as ZodType<unknown>)) {
      data = this.rank(options.userContent);
    } else {
      throw new Error(`HeuristicLlmClient has no strategy for schema ${String(options.schema)}`);
    }

    // Data is built against these exact shapes; assert through the schema
    // so any drift fails loudly in tests instead of silently corrupting.
    return { data: options.schema.parse(data), usage: null };
  }

  private visionFallback(): VisionResult {
    return {
      foods: [],
      ingredients: [],
      components: {
        protein: false,
        fiber_sources: false,
        healthy_fat_sources: false,
        carbohydrates: false,
        sodium_likely_high: false,
      },
      uncertainties: [
        {
          field: 'foods',
          reason: 'Image analysis unavailable - describe your meal in a few words instead',
          confidence: 0.0,
        },
      ],
    };
  }

  private extractFromText(input: string): TextExtractionResult {
    const needle = input.toLowerCase();
    const matched = new Map<string, IngredientRecord>();

    for (const record of INGREDIENTS) {
      const terms = [record.name, ...record.aliases];
      if (terms.some((term) => needle.includes(term))) {
        matched.set(record.name, record);
      }
    }

    const foods = [...matched.keys()].slice(0, 5).map((name) => ({
      name,
      confidence: 0.85,
    }));

    const ingredients = [...matched.values()].slice(0, 10).map((record) => ({
      name: record.name,
      confidence: 0.8,
      state: record.state,
      estimatedQuantity: null as string | null,
    }));

    const components = {
      protein: false,
      fiber_sources: false,
      healthy_fat_sources: false,
      carbohydrates: false,
      sodium_likely_high: false,
    };
    for (const record of matched.values()) {
      for (const component of record.components) {
        components[component] = true;
      }
    }

    const uncertainties =
      matched.size === 0
        ? [
            {
              field: 'foods',
              reason: 'Could not recognize specific foods from the description',
              confidence: 0.3,
            },
          ]
        : [];

    // Nothing recognized: keep the raw phrase as one low-confidence food so
    // downstream stages still have something honest to work with.
    if (matched.size === 0 && needle.trim().length > 0) {
      foods.push({ name: input.trim().slice(0, 80), confidence: 0.4 });
    }

    return { foods, ingredients, components, uncertainties };
  }

  private rank(userContent: string | Record<string, unknown>): RankingResult {
    const payload: RankingPayload =
      typeof userContent === 'string'
        ? safeJsonParse(userContent)
        : (userContent as RankingPayload);

    const missing = new Set(payload.missingComponents ?? []);
    const candidates = payload.candidates ?? [];
    const profile = payload.custom?.profile;
    const recentlyShown = payload.custom?.recentlyShown ?? [];
    const mealGroup = (payload.custom?.mealGroup ?? 'other') as OnboardingMealGroup | 'other';
    const profileConfidence = profile?.profileConfidence ?? 0;

    const scored = candidates.map((candidate) => {
      const improvementKeys = Object.keys(candidate.nutritionalImprovement ?? {});
      const coverage =
        missing.size === 0
          ? 0.5
          : improvementKeys.filter((key) => missing.has(key)).length / missing.size;

      const additionCount = candidate.additions?.length ?? 0;
      const minimal =
        additionCount <= 1 && (candidate.cookingSteps ?? 0) === 0
          ? 1.0
          : additionCount <= 1
            ? 0.7
            : 0.4;

      const timeScore = Math.max(0, 1 - (candidate.estimatedTime ?? 10) / 30);
      const preference = candidate.preferenceAlignment ?? 0.5;

      const factorAffinity = profile
        ? factorAffinityForCandidate(
            candidate,
            profile,
            payload.missingComponents ?? [],
            recentlyShown,
          )
        : 0;
      const affinity = clamp01(0.6 * preference + 0.4 * normalize(factorAffinity));

      const roleClass = roleClassForAddition(candidate.additions?.[0]?.name ?? '');
      const mealContext = clamp01(
        0.6 * (0.5 + 5 * genericMealPrior(mealGroup, roleClass)) + 0.4 * coverage,
      );

      const practicality = clamp01(0.7 * minimal + 0.3 * timeScore);
      const freshness = clamp01(1 + recencyPenalty(recentAppearances(candidate, recentlyShown)));
      const counts = familyCounts(recentlyShown);
      const diversity = clamp01(1 + familyBenefit(roleFamily(roleClass), counts));

      let overallScore =
        COLD_START_WEIGHTS.w1 * affinity +
        COLD_START_WEIGHTS.w2 * mealContext +
        COLD_START_WEIGHTS.w3 * practicality +
        COLD_START_WEIGHTS.w4 * freshness +
        COLD_START_WEIGHTS.w5 * diversity;

      // Safety gate (spec §7): low profile confidence favors safe + familiar
      // + small-exploration picks among otherwise-equal candidates.
      if (
        profileConfidence < SAFETY_GATE_THRESHOLD &&
        minimal === 1 &&
        (candidate.estimatedTime ?? 10) <= SAFETY_PICK_MAX_MINUTES
      ) {
        overallScore += SAFETY_PICK_BOOST;
      }

      // Guardrail (spec §8): a strongly preferred, compatible, practical
      // candidate always wins - diversity/freshness never override it.
      if (
        affinity >= STRONG_AFFINITY &&
        mealContext >= STRONG_MEAL_CONTEXT &&
        practicality >= STRONG_PRACTICALITY
      ) {
        overallScore = Math.max(overallScore, STRONG_PREFERENCE_FLOOR);
      }

      overallScore = clamp01(overallScore);

      const signals = [
        `affinity=${affinity.toFixed(2)}`,
        `context=${mealContext.toFixed(2)}`,
        `practicality=${practicality.toFixed(2)}`,
        `freshness=${freshness.toFixed(2)}`,
        `diversity=${diversity.toFixed(2)}`,
      ];
      if (profile) signals.push(`factor=${factorAffinity.toFixed(2)}`);
      if (profileConfidence < SAFETY_GATE_THRESHOLD) signals.push('safety');

      return {
        candidateId: candidate.id,
        overallScore: Number(overallScore.toFixed(3)),
        reasoning: `deterministic score: ${signals.join(' ')}`,
        explanation: buildExplanation(candidate),
      };
    });

    scored.sort((a, b) => b.overallScore - a.overallScore);

    return {
      rankedCandidates: scored.length > 0 ? scored : fallbackRank(payload),
      rankingConfidence: 0.6,
    };
  }
}

function fallbackRank(payload: RankingPayload): RankingResult['rankedCandidates'] {
  return (payload.candidates ?? []).map((candidate) => ({
    candidateId: candidate.id,
    overallScore: 0.5,
    reasoning: 'no scoring inputs available',
    explanation: buildExplanation(candidate),
  }));
}

function buildExplanation(candidate: NonNullable<RankingPayload['candidates']>[number]): string {
  const what = describeAction(candidate);
  const time = candidate.estimatedTime ?? 5;
  const benefits = Object.keys(candidate.nutritionalImprovement ?? {})
    .map((key) => key.replace(/_/g, ' '))
    .join(' and ');

  const benefitPhrase = benefits
    ? ` That adds ${benefits} - exactly what this meal is missing.`
    : '';
  const effortPhrase =
    (candidate.cookingSteps ?? 0) === 0
      ? 'No real cooking needed'
      : 'Only a few minutes of cooking';

  return `${what} It takes about ${time} minutes. ${effortPhrase}.${benefitPhrase}`;
}

function describeAction(candidate: NonNullable<RankingPayload['candidates']>[number]): string {
  if (candidate.type === 'substitution' && candidate.substitutions?.[0]) {
    const sub = candidate.substitutions[0];
    return `Try swapping ${sub.original.name} for ${sub.replacement.name}.`;
  }
  const names = (candidate.additions ?? []).map((addition) => addition.name);
  if (names.length > 0) {
    return `Add ${names.join(' and ')} to what you're already eating.`;
  }
  return 'Small tweak: adjust how you plate or season the meal.';
}

function safeJsonParse(raw: string): RankingPayload {
  try {
    return JSON.parse(raw) as RankingPayload;
  } catch {
    return {};
  }
}
