import { randomUUID } from 'node:crypto';

import type {
  AdditionFactorKey,
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingFactorSummary,
  OnboardingPair,
  OnboardingSummaryResponse,
} from '@meal-rescue/shared-types';
import { TasteMemoryEntry } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { PAIRS, getPair } from './onboarding';
import { profileConfidenceFromFactors } from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';

export const FACTOR_LABELS: Record<AdditionFactorKey, string> = {
  nutritional: 'Balance',
  sensory: 'Texture & Flavor',
  satisfaction: 'Satisfaction',
  modification: 'Keeps it Interesting',
  exploration: 'Adventurous',
};

const ADDITION_FACTOR_CONTEXT: Record<AdditionFactorKey, string> = {
  nutritional: 'addition_nutritional',
  sensory: 'addition_sensory',
  satisfaction: 'addition_satisfaction',
  modification: 'addition_modification',
  exploration: 'addition_exploration',
};

/** Cold-start evidence weight; real behavior (Plans 2/3 events) uses higher. */
const COLD_START_EVIDENCE_WEIGHT = 0.6;
/** Unchosen option penalty applies only when a choice was made. */
const CHOSEN_EVIDENCE = 0.5;
const UNCHOSEN_EVIDENCE = -0.2;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Weighted posterior update (design spec correction #1).
 * new = old * (1 - w) + evidence * w, with w decaying as evidence accumulates
 * so later signals always override the earlier cold-start prior.
 */
export function weightedPosterior(
  oldAffinity: number,
  oldCount: number,
  evidence: number,
  evidenceWeight: number,
): number {
  const w = evidenceWeight / (1 + oldCount * 0.35);
  return round2(clamp(oldAffinity * (1 - w) + evidence * w, -1, 1));
}

export function confidenceFor(count: number, affinity: number): number {
  if (count === 0) return 0;
  return round2(Math.min(0.9, 0.35 + (count - 1) * 0.1 + Math.abs(affinity) * 0.25));
}

export function confidenceState(
  count: number,
  affinity: number,
): 'unknown' | 'inferred' | 'confirmed' {
  if (count === 0) return 'unknown';
  if (count >= 3 || Math.abs(affinity) >= 0.4) return 'confirmed';
  return 'inferred';
}

export class MealCompletionService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async startOnboarding(userId: string): Promise<{ pair: OnboardingPair | null; seeded: boolean }> {
    const seeded = await this.isSeeded(userId);
    if (seeded) return { pair: null, seeded: true };
    return { pair: this.pickNextPair(userId, new Set()), seeded: false };
  }

  async answerOnboarding(
    userId: string,
    answer: OnboardingAnswer,
  ): Promise<OnboardingAnswerResponse> {
    const pair = getPair(answer.pairId);
    if (!pair) throw new Error(`Unknown pairId '${answer.pairId}'`);

    await this.applyAnswer(userId, pair, answer);

    const profile = await this.getTasteProfile(userId);
    const answered = await this.answeredPairIds(userId);

    if (answered.size >= PAIRS.length) {
      const summary = await this.getSummaryFromProfile(userId, profile);
      return { next: null, summary };
    }
    const next = this.pickNextPairFromProfile(profile, answered);
    return { next, summary: null };
  }

  async getSummary(userId: string): Promise<OnboardingSummaryResponse> {
    const profile = await this.getTasteProfile(userId);
    return this.getSummaryFromProfile(userId, profile);
  }

  /**
   * Cold-start profile for the ranking layer (Plan 3). mealGroup is joined
   * by the pipeline, which knows the analyzed meal's foods.
   */
  async getRankingInputs(userId: string): Promise<Omit<RankingProfileInput, 'mealGroup'>> {
    const summary = await this.getSummary(userId);
    return {
      coldStartFactors: summary.factors.map((factor) => ({
        factor: factor.factor,
        affinity: factor.score,
        confidence: factor.confidence,
      })),
      mealGroupAffinities: summary.mealGroupAffinities,
      profileConfidence: profileConfidenceFromFactors(summary.factors),
    };
  }

  // --- inference -------------------------------------------------------------

  private async applyAnswer(
    userId: string,
    pair: OnboardingPair,
    answer: OnboardingAnswer,
  ): Promise<void> {
    const state = answer.selected
      ? 'selected'
      : answer.unavailableOption
        ? 'unavailable'
        : 'skipped';

    const selectedOption =
      answer.selected === 'A' ? pair.optionA : answer.selected === 'B' ? pair.optionB : null;
    const unselectedOption =
      answer.selected === 'A' ? pair.optionB : answer.selected === 'B' ? pair.optionA : null;

    for (const { factor, weight } of pair.tests) {
      if (selectedOption) {
        await this.applyCellSignal({
          userId,
          ingredient: selectedOption.name,
          contextType: ADDITION_FACTOR_CONTEXT[factor],
          contextValue: 'overall',
          evidence: CHOSEN_EVIDENCE * weight,
        });
      }
      if (unselectedOption) {
        await this.applyCellSignal({
          userId,
          ingredient: unselectedOption.name,
          contextType: ADDITION_FACTOR_CONTEXT[factor],
          contextValue: 'overall',
          evidence: UNCHOSEN_EVIDENCE * weight,
        });
      }
    }

    // Light meal-context tiebreaker (design: context metadata, never cuisine).
    // Only written when the user actually chose; UNAVAILABLE stays neutral.
    if (selectedOption) {
      await this.applyCellSignal({
        userId,
        ingredient: selectedOption.name,
        contextType: 'addition_x_meal_group',
        contextValue: pair.baseMeal.mealGroup,
        evidence: 0.25,
      });
    }

    await this.models.AdditionEvent.create({
      id: randomUUID(),
      userId,
      pairId: pair.id,
      baseMealName: pair.baseMeal.name,
      baseMealGroup: pair.baseMeal.mealGroup,
      cuisineLabel: pair.baseMeal.cuisineLabel,
      additionA: pair.optionA.name,
      additionB: pair.optionB.name,
      selected: answer.selected,
      state,
      rejectionReason: answer.rejectionReason ?? null,
      unavailableOption: answer.unavailableOption,
    });
  }

  private async applyCellSignal(args: {
    userId: string;
    ingredient: string;
    contextType: string;
    contextValue: string;
    evidence: number;
  }): Promise<void> {
    const existing = await this.models.TasteMemory.findOne({
      where: {
        userId: args.userId,
        ingredient: args.ingredient,
        contextType: args.contextType,
        contextValue: args.contextValue,
      },
    });

    if (!existing) {
      await this.models.TasteMemory.create({
        id: randomUUID(),
        userId: args.userId,
        ingredient: args.ingredient,
        contextType: args.contextType,
        contextValue: args.contextValue,
        affinity: round2(clamp(args.evidence, -1, 1)),
        confidence: confidenceFor(1, args.evidence),
        observationCount: 1,
        source: 'cold_start',
        lastUpdated: new Date(),
      });
      return;
    }

    const row = existing.get();
    const count = Number(row.observationCount);
    const affinity = weightedPosterior(
      Number(row.affinity),
      count,
      args.evidence,
      COLD_START_EVIDENCE_WEIGHT,
    );
    const confidence = confidenceFor(count + 1, affinity);
    existing.set({
      affinity,
      confidence,
      observationCount: count + 1,
      source: 'cold_start',
      lastUpdated: new Date(),
    });
    await existing.save();
  }

  private async isSeeded(userId: string): Promise<boolean> {
    const count = await this.models.AdditionEvent.count({ where: { userId } });
    return count > 0;
  }

  private async answeredPairIds(userId: string): Promise<Set<string>> {
    const rows = await this.models.AdditionEvent.findAll({
      where: { userId },
      attributes: ['pairId'],
    });
    return new Set(rows.map((r) => String(r.get('pairId'))));
  }

  private async getTasteProfile(userId: string): Promise<TasteMemoryEntry[]> {
    const rows = await this.models.TasteMemory.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
    });
    return rows.map((row) => row.get() as unknown as TasteMemoryEntry);
  }

  /** Adaptive selection: highest-value uncertainty among unanswered pairs. */
  private pickNextPair(userId: string, answered: Set<string>): OnboardingPair | null {
    return this.pickNextPairFromProfile([], answered, userId);
  }

  private pickNextPairFromProfile(
    profile: TasteMemoryEntry[],
    answered: Set<string>,
    userId?: string,
  ): OnboardingPair | null {
    const factorAffinity = this.factorAffinityMap(profile);
    const candidates = PAIRS.filter(
      (p) => !answered.has(p.id) && (userId === undefined || !this.pairHasEvidence(userId, p.id)),
    );
    if (candidates.length === 0) return null;

    const pick = candidates
      .map((pair) => {
        const uncertainty = pair.tests.reduce((sum, { factor, weight }) => {
          const affinity = factorAffinity.get(factor) ?? 0;
          return sum + weight * (1 - Math.abs(affinity));
        }, 0);
        return { pair, uncertainty };
      })
      .sort((a, b) => b.uncertainty - a.uncertainty)[0]!.pair;
    return pick;
  }

  private pairHasEvidence(_userId: string, _pairId: string): boolean {
    // Fallback already covered by `answered` set from event log; kept for the
    // in-memory fake path in tests where event rows may be absent.
    return false;
  }

  private factorAffinityMap(profile: TasteMemoryEntry[]): Map<AdditionFactorKey, number> {
    const map = new Map<AdditionFactorKey, number>();
    for (const factor of Object.keys(ADDITION_FACTOR_CONTEXT) as AdditionFactorKey[]) {
      const cells = profile.filter(
        (m) => m.contextType === ADDITION_FACTOR_CONTEXT[factor] && m.contextValue === 'overall',
      );
      if (cells.length === 0) continue;
      const totalWeight = cells.reduce((s, m) => s + Math.max(0.1, m.confidence), 0);
      const score =
        cells.reduce((s, m) => s + m.affinity * Math.max(0.1, m.confidence), 0) / totalWeight;
      map.set(factor, round2(score));
    }
    return map;
  }

  private async getSummaryFromProfile(
    userId: string,
    profile: TasteMemoryEntry[],
  ): Promise<OnboardingSummaryResponse> {
    const factors: OnboardingFactorSummary[] = [];
    for (const factor of Object.keys(ADDITION_FACTOR_CONTEXT) as AdditionFactorKey[]) {
      const cells = profile.filter(
        (m) => m.contextType === ADDITION_FACTOR_CONTEXT[factor] && m.contextValue === 'overall',
      );
      const evidenceCount = cells.reduce((s, m) => s + Number(m.observationCount), 0);
      const totalWeight = cells.reduce((s, m) => s + Math.max(0.1, m.confidence), 0);
      const score =
        totalWeight === 0
          ? 0
          : round2(
              cells.reduce((s, m) => s + m.affinity * Math.max(0.1, m.confidence), 0) / totalWeight,
            );
      factors.push({
        factor,
        label: FACTOR_LABELS[factor],
        score,
        confidence: confidenceState(evidenceCount, score),
        evidenceCount,
      });
    }

    const mealGroupRows = profile.filter((m) => m.contextType === 'addition_x_meal_group');
    const mealGroupAffinities: Record<string, number> = {};
    for (const row of mealGroupRows) {
      const group = row.contextValue;
      const prior = mealGroupAffinities[group] ?? 0;
      mealGroupAffinities[group] = round2(prior + row.affinity * Math.max(0.1, row.confidence));
    }

    const seeded = (await this.answeredPairIds(userId)).size > 0;
    return { factors, mealGroupAffinities, seeded };
  }
}
