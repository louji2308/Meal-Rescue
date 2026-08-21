/**
 * Ranking engine (implementation plan step 2.5).
 *
 * The LLM never decides alone: it only ORDERS pre-filtered candidates and
 * writes friendly explanations. Scores are validated, unknown candidate
 * ids are dropped, omitted candidates are re-inserted with neutral
 * scores, and provider failure falls back to the deterministic client -
 * so the endpoint degrades, never breaks.
 */
import type { Constraints, RankedRecommendation, RescueCandidate } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import { HeuristicLlmClient } from './ai/heuristic-llm-client';
import type { LlmClient } from './ai/llm-client';
import { type RankingResult, rankingResultSchema } from './ai/llm-schemas';
import { CANDIDATE_RANKING_SYSTEM_PROMPT } from './ai/prompts';
import type { UserPreferenceSnapshot } from './candidate-generator.service';

export interface RankingMealContext {
  detectedFoods: Array<{ name: string }>;
  detectedComponents: Record<string, boolean>;
}

export class RankingEngineService {
  private readonly fallbackClient = new HeuristicLlmClient();

  constructor(private readonly llm: LlmClient) {}

  async rankAndExplain(
    candidates: RescueCandidate[],
    meal: RankingMealContext,
    constraints: Constraints,
    preferences: UserPreferenceSnapshot,
  ): Promise<RankedRecommendation[]> {
    if (candidates.length === 0) return [];

    const missingComponents = identifyMissingComponents(meal.detectedComponents);
    const payload = {
      meal: { foods: meal.detectedFoods.map((food) => food.name) },
      missingComponents,
      constraints,
      preferences: {
        favorites: preferences.favoriteFoods ?? [],
        avoided: preferences.avoidedFoods ?? [],
      },
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        additions: candidate.additions.map((addition) => ({ name: addition.name })),
        substitutions: candidate.substitutions.map((substitution) => ({
          original: substitution.original.name,
          replacement: substitution.replacement.name,
        })),
        estimatedTime: candidate.estimatedTime,
        estimatedCost: candidate.estimatedCost,
        cookingSteps: candidate.cookingSteps,
        nutritionalImprovement: candidate.nutritionalImprovement,
        preferenceAlignment: candidate.preferenceAlignment,
      })),
    };

    let result: RankingResult;
    try {
      const response = await this.llm.completeJson({
        systemPrompt: CANDIDATE_RANKING_SYSTEM_PROMPT,
        userContent: payload,
        schema: rankingResultSchema,
        modelName: env.OPENAI_TEXT_MODEL,
      });
      result = response.data;
    } catch {
      // Graceful degradation (architecture doc): deterministic scoring.
      const fallback = await this.fallbackClient.completeJson({
        systemPrompt: CANDIDATE_RANKING_SYSTEM_PROMPT,
        userContent: payload,
        schema: rankingResultSchema,
        modelName: 'heuristic',
      });
      result = fallback.data;
    }

    return this.join(candidates, result);
  }

  /**
   * Join LLM output back onto real candidate objects. Only trusted fields
   * survive; anything the model dropped or invented is repaired here.
   */
  private join(candidates: RescueCandidate[], result: RankingResult): RankedRecommendation[] {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const joined: RankedRecommendation[] = [];
    const consumed = new Set<string>();

    for (const entry of result.rankedCandidates) {
      const candidate = byId.get(entry.candidateId);
      if (!candidate || consumed.has(entry.candidateId)) continue;
      consumed.add(entry.candidateId);
      joined.push({
        candidate,
        rankScore: entry.overallScore,
        reasoning: entry.reasoning || 'Ranked by the rescue engine',
        naturalLanguageExplanation: entry.explanation || defaultExplanation(candidate),
      });
    }

    // Model omitted some candidates - keep them, neutrally scored.
    for (const candidate of candidates) {
      if (!consumed.has(candidate.id)) {
        joined.push({
          candidate,
          rankScore: 0.5,
          reasoning: 'Not explicitly ranked; kept as an alternative',
          naturalLanguageExplanation: defaultExplanation(candidate),
        });
      }
    }

    return joined.sort((a, b) => b.rankScore - a.rankScore);
  }
}

export function identifyMissingComponents(components: Record<string, boolean>): string[] {
  const missing: string[] = [];
  if (!components.protein) missing.push('protein');
  if (!components.fiber_sources) missing.push('fiber_sources');
  if (!components.healthy_fat_sources) missing.push('healthy_fat_sources');
  return missing;
}

function defaultExplanation(candidate: RescueCandidate): string {
  const names = candidate.additions.map((addition) => addition.name);
  if (names.length > 0) {
    return `Add ${names.join(' and ')} - about ${candidate.estimatedTime} minutes${
      candidate.cookingSteps === 0 ? ', no cooking needed' : ''
    }.`;
  }
  const sub = candidate.substitutions[0];
  if (sub) {
    return `Swap ${sub.original.name} for ${sub.replacement.name} - same meal, better fit.`;
  }
  return 'A small tweak that fits your constraints.';
}
