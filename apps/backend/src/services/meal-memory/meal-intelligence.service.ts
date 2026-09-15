/**
 * MealIntelligenceService — deterministic first-pass meal-plan intelligence.
 *
 * Three read-only endpoints powered by FoodWorldState (same data the planner
 * uses). No database writes. No network unless the optional AI polish layer
 * is enabled, and even then: LLMs may suggest copy but never rank or decide.
 */
import { randomUUID } from 'node:crypto';

import type {
  EffortLevel,
  FoodWorldState,
  MealIdea,
  MealInsightKind,
  MealMemoryExpiringItem,
  MealMemoryLeftoverSummary,
  MealMemorySuggestionsResponse,
  MealMemorySummaryResponse,
  MealMemoryUseWhatYouHaveResponse,
  MealSuggestion,
  MealSuggestionReason,
  MealSuggestionReasonKind,
  MealSuggestionUsesUp,
  MealSlot,
  SlotKey,
  UUID,
} from '@meal-rescue/shared-types';

import { AppError } from '../../lib/errors';
import { ErrorCategory } from '@meal-rescue/shared-types';
import type { HouseholdService } from '../common-table/household.service';
import { dateKeyFor, weekStartFor } from './date-utils';
import {
  Candidate,
  matchGradeFor,
  methodFor,
  PlanParams,
  RankedWeekCandidate,
  scoreToMatchPercent,
} from './planning-engine';
import { PlanningEngine } from './planning-engine';
import { WorldStateService } from './world-state.service';
import type { MealMemoryAiService } from './meal-memory-ai.service';

const DEFAULT_WEEK_MEAL_SLOTS: MealSlot[] = ['dinner', 'lunch'];

export interface MealIntelligenceDeps {
  worldStateService: WorldStateService;
  planningEngine: PlanningEngine;
  householdService: HouseholdService;
  aiService?: MealMemoryAiService;
}

export class MealIntelligenceService {
  private readonly worldStateService: WorldStateService;
  private readonly planningEngine: PlanningEngine;
  private readonly householdService: HouseholdService;
  private readonly aiService?: MealMemoryAiService;

  constructor(deps: MealIntelligenceDeps) {
    this.worldStateService = deps.worldStateService;
    this.planningEngine = deps.planningEngine;
    this.householdService = deps.householdService;
    this.aiService = deps.aiService;
  }

  // ---------------------------------------------------------------
  // GET /suggestions
  // ---------------------------------------------------------------

  async suggestions(
    userId: UUID,
    opts: { weekStart?: string; mealSlot?: MealSlot; limit?: number; strategy?: PlanParams['strategy'] },
  ): Promise<MealMemorySuggestionsResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);
    const weekStart = opts.weekStart ?? weekStartFor(todayKey);
    const world = await this.worldStateService.getState(householdId, userId);
    const params: PlanParams = {
      weekStart,
      mealSlots: opts.mealSlot ? [opts.mealSlot] : DEFAULT_WEEK_MEAL_SLOTS,
      strategy: opts.strategy ?? 'balance',
      ownerUserId: userId,
    };

    const ranked = this.planningEngine.rankWeek(world, params);
    const limit = opts.limit ?? 6;
    const suggestions = this.buildSuggestions(ranked, world, limit, opts.mealSlot ?? null);

    return {
      weekStart,
      mealSlot: opts.mealSlot ?? null,
      basedOn: {
        openSlots: world.openSlots.length,
        blockedSlots: world.blockedSlots.length,
        expiringItems: world.expiringItems.length,
        leftovers: world.leftovers.length,
        activeConstraints: world.activeConstraints.length,
      },
      suggestions,
    };
  }

  // ---------------------------------------------------------------
  // GET /use-what-you-have
  // ---------------------------------------------------------------

  async useWhatYouHave(
    userId: UUID,
    opts: { limit?: number } = {},
  ): Promise<MealMemoryUseWhatYouHaveResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const world = await this.worldStateService.getState(householdId, userId);
    const candidates = this.planningEngine.buildCandidates(world);
    const limit = opts.limit ?? 6;

    const ideas: MealIdea[] = candidates
      .map((candidate) => ({
        candidate,
        score: this.kitchenFitScore(candidate),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ candidate }) => this.candidateToIdea(candidate));

    return {
      basedOn: {
        inventoryCount: world.inventory.length,
        expiringCount: world.expiringItems.length,
        leftoverCount: world.leftovers.length,
        activeConstraints: world.activeConstraints.length,
      },
      ideas,
    };
  }

  // ---------------------------------------------------------------
  // GET /summary
  // ---------------------------------------------------------------

  async summary(
    userId: UUID,
    opts: { weekStart?: string } = {},
  ): Promise<MealMemorySummaryResponse> {
    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);
    const weekStart = opts.weekStart ?? weekStartFor(todayKey);
    const world = await this.worldStateService.getState(householdId, userId);

    const plannedMeals = world.plannedMeals.filter((m) => m.kind === 'plan');
    const planned = plannedMeals.filter(
      (m) => m.state === 'PLANNED' || m.state === 'CONFIRMED',
    ).length;
    const confirmed = plannedMeals.filter((m) => m.state === 'CONFIRMED').length;
    const eaten = world.actualMeals.filter((m) => m.state === 'EATEN').length;
    const openSlots = world.openSlots.length;
    const blockedSlots = world.blockedSlots.length;
    const filledOrBlocked = planned + blockedSlots;
    const totalSlots = filledOrBlocked + openSlots;
    const coveragePercent = totalSlots === 0 ? 0 : Math.round((filledOrBlocked / totalSlots) * 100);

    const expiringSoon: MealMemoryExpiringItem[] = world.expiringItems
      .filter((item) => item.expiresAt != null && item.daysUntilExpiry != null && item.daysUntilExpiry >= 0)
      .sort((a, b) => (a.daysUntilExpiry ?? 999) - (b.daysUntilExpiry ?? 999))
      .map((item) => ({
        name: item.name,
        quantity: item.quantity ?? 0,
        unit: item.unit,
        expiresAt: item.expiresAt!,
        expiresInDays: item.daysUntilExpiry!,
      }));

    const leftovers: MealMemoryLeftoverSummary[] = world.leftovers.map((lo) => ({
      name: lo.dishName ?? lo.name,
      servings: lo.servings ?? 0,
      ageDays: lo.madeAt != null ? this.daysBetween(lo.madeAt, todayKey) : 0,
    }));

    const purchaseNeeds = world.purchaseNeeds.map((p) => ({
      ingredient: p.ingredient,
      reason: p.reason,
    }));

    const insights = this.buildInsights(world, planned, openSlots, blockedSlots, coveragePercent, eaten);

    const topSuggestion = this.pickTopSuggestion(world, weekStart);
    const highlight = topSuggestion
      ? { concept: topSuggestion.concept, message: topSuggestion.reasons[0]?.message ?? '' }
      : null;

    const plannedMealsCount = plannedMeals.length;
    const headline = this.buildHeadline({
      planned,
      openSlots,
      expiringCount: expiringSoon.length,
      leftoversCount: leftovers.length,
    });

    const recordedMeals = world.actualMeals.filter((m) => m.state === 'EATEN' || m.state === 'SKIPPED').length;

    return {
      weekStart,
      headline,
      planning: { planned, confirmed, eaten, openSlots, blockedSlots, coveragePercent },
      expiringSoon,
      leftovers,
      purchaseNeeds,
      insights,
      highlight,
      engagement: {
        recordedMeals,
        plannedMeals: plannedMealsCount,
        recordRatio: plannedMealsCount === 0 ? 0 : Math.round((recordedMeals / plannedMealsCount) * 100),
      },
    };
  }

  // ---------------------------------------------------------------
  // Internals — suggestions
  // ---------------------------------------------------------------

  private buildSuggestions(
    ranked: RankedWeekCandidate[],
    world: FoodWorldState,
    limit: number,
    filterSlot: MealSlot | null,
  ): MealSuggestion[] {
    // For each unique candidate, find its best score and all slots.
    const byCandidate = new Map<string, { best: RankedWeekCandidate; all: RankedWeekCandidate[] }>();

    for (const entry of ranked) {
      if (filterSlot && entry.slot.mealSlot !== filterSlot) continue;
      const key = entry.candidate.source.id;
      const existing = byCandidate.get(key);
      if (!existing) {
        byCandidate.set(key, { best: entry, all: [entry] });
      } else {
        existing.all.push(entry);
        if (entry.score > existing.best.score) existing.best = entry;
      }
    }

    return [...byCandidate.values()]
      .sort((a, b) => b.best.score - a.best.score)
      .slice(0, limit)
      .map(({ best, all }) => {
        const candidate = best.candidate;
        const matchPercent = scoreToMatchPercent(best.score);
        const matchGrade = matchGradeFor(matchPercent);

        const reasons: MealSuggestionReason[] = best.reasons.map((message) => ({
          kind: this.reasonKindFor(message),
          message,
        }));

        const fits: SlotKey[] = all
          .sort((a, b) => b.score - a.score)
          .slice(0, 7)
          .map((e) => e.slot);

        return {
          id: randomUUID(),
          concept: methodFor(candidate.source, candidate.recordName),
          conceptType: candidate.isLeftover ? 'leftover' : 'recipe',
          matchPercent,
          matchGrade,
          reasons,
          usesUp: [this.itemToUsesUp(candidate.source)],
          fits,
          mealRole: best.planReasons[0]?.kind === 'leftover' ? 'LEFTOVER'
            : candidate.isExpiringSoon ? 'USE_SOON'
            : candidate.affinity > 0.6 ? 'FAMILY_FAVORITE'
            : 'BALANCE',
          effort: this.effortFor(candidate.prepTimeMinutes),
          prepTimeMinutes: candidate.prepTimeMinutes,
        };
      });
  }

  // ---------------------------------------------------------------
  // Internals — use-what-you-have
  // ---------------------------------------------------------------

  /**
   * Lightweight kitchen-fit score for a single candidate, independent of
   * any specific calendar slot or week structure. Mirrors PlanningEngine's
   * scoring arithmetic but omits week-specific terms (usage dedup,
   * exposure penalty, strategy bonuses) which are irrelevant for
   * "what can I make right now."
   */
  private kitchenFitScore(candidate: Candidate): number {
    let score = 1;
    score += candidate.affinity * 1.5;
    if (candidate.isExpiringSoon) score += 2;
    if (candidate.isLeftover) score += 1.5;
    if (candidate.prepTimeMinutes <= 10) score += 1.2;
    return score;
  }

  private candidateToIdea(candidate: Candidate): MealIdea {
    const reasons: MealSuggestionReason[] = [];
    if (candidate.isLeftover) reasons.push({ kind: 'leftover', message: `Uses leftover ${candidate.label}` });
    if (candidate.isExpiringSoon) reasons.push({ kind: 'expiry', message: `${candidate.label} expires soon` });
    if (candidate.affinity > 0.2) reasons.push({ kind: 'affinity', message: 'Fits the household taste' });
    if (reasons.length === 0) reasons.push({ kind: 'affinity', message: 'Available in your kitchen' });

    return {
      id: randomUUID(),
      concept: methodFor(candidate.source, candidate.recordName),
      conceptType: candidate.isLeftover ? 'leftover' : 'recipe',
      usesUp: [this.itemToUsesUp(candidate.source)],
      estimatedServings: candidate.source.servings ?? 2,
      effort: this.effortFor(candidate.prepTimeMinutes),
      prepTimeMinutes: candidate.prepTimeMinutes,
      mealRole: candidate.isLeftover ? 'LEFTOVER'
        : candidate.isExpiringSoon ? 'USE_SOON'
        : candidate.affinity > 0.6 ? 'FAMILY_FAVORITE'
        : 'BALANCE',
      reasons,
    };
  }

  // ---------------------------------------------------------------
  // Internals — summary
  // ---------------------------------------------------------------

  private buildInsights(
    world: FoodWorldState,
    planned: number,
    openSlots: number,
    blockedSlots: number,
    coveragePercent: number,
    eaten: number,
  ): { kind: MealInsightKind; message: string }[] {
    const insights: { kind: MealInsightKind; message: string }[] = [];

    if (world.expiringItems.length > 0) {
      insights.push({
        kind: 'expiry',
        message: `${world.expiringItems.length} item${world.expiringItems.length === 1 ? '' : 's'} expiring soon — plan them now`,
      });
    }

    if (world.leftovers.length > 0) {
      insights.push({
        kind: 'leftover',
        message: `${world.leftovers.length} leftover${world.leftovers.length === 1 ? '' : 's'} waiting to be reused`,
      });
    }

    if (openSlots > 0) {
      const slotWord = openSlots === 1 ? 'slot' : 'slots';
      insights.push({
        kind: 'open_slot',
        message: `${openSlots} open ${slotWord} remain for the week`,
      });
    }

    if (coveragePercent >= 80) {
      insights.push({
        kind: 'variety',
        message: `${coveragePercent}% of the week is planned — well covered`,
      });
    } else if (coveragePercent < 40) {
      insights.push({
        kind: 'open_slot',
        message: `Week is less than half planned — review open slots`,
      });
    }

    if (world.purchaseNeeds.length > 0) {
      insights.push({
        kind: 'purchase',
        message: `${world.purchaseNeeds.length} purchase suggestion${world.purchaseNeeds.length === 1 ? '' : 's'} for upcoming needs`,
      });
    }

    if (eaten > 0 && planned > 0 && eaten >= planned) {
      insights.push({
        kind: 'engagement',
        message: 'Great engagement — you\'ve recorded every planned meal',
      });
    }

    return insights;
  }

  private pickTopSuggestion(
    world: FoodWorldState,
    weekStart: string,
  ): MealSuggestion | null {
    const params: PlanParams = {
      weekStart,
      mealSlots: DEFAULT_WEEK_MEAL_SLOTS,
      strategy: 'balance',
      ownerUserId: world.household?.ownerId ?? '',
    };
    const ranked = this.planningEngine.rankWeek(world, params);
    if (ranked.length === 0) return null;

    const byCandidate = new Map<string, RankedWeekCandidate>();
    for (const entry of ranked) {
      const existing = byCandidate.get(entry.candidate.source.id);
      if (!existing || entry.score > existing.score) byCandidate.set(entry.candidate.source.id, entry);
    }

    const best = [...byCandidate.values()].sort((a, b) => b.score - a.score)[0];
    if (!best) return null;

    const matchPercent = scoreToMatchPercent(best.score);
    return {
      id: randomUUID(),
      concept: methodFor(best.candidate.source, best.candidate.recordName),
      conceptType: best.candidate.isLeftover ? 'leftover' : 'recipe',
      matchPercent,
      matchGrade: matchGradeFor(matchPercent),
      reasons: best.reasons.map((message) => ({ kind: this.reasonKindFor(message), message })),
      usesUp: [this.itemToUsesUp(best.candidate.source)],
      fits: [best.slot],
      mealRole: best.planReasons[0]?.kind === 'leftover' ? 'LEFTOVER' : 'BALANCE',
      effort: this.effortFor(best.candidate.prepTimeMinutes),
      prepTimeMinutes: best.candidate.prepTimeMinutes,
    };
  }

  // ---------------------------------------------------------------
  // Headline generation (deterministic; AI polish is a thin layer)
  // ---------------------------------------------------------------

  private buildHeadline(stats: {
    planned: number;
    openSlots: number;
    expiringCount: number;
    leftoversCount: number;
  }): string {
    if (stats.planned === 0 && stats.expiringCount === 0 && stats.leftoversCount === 0) {
      return 'No meals planned yet — start by exploring what you have';
    }
    const parts: string[] = [];
    if (stats.planned > 0) {
      parts.push(`${stats.planned} meal${stats.planned === 1 ? '' : 's'} planned`);
    }
    if (stats.expiringCount > 0) {
      parts.push(`${stats.expiringCount} item${stats.expiringCount === 1 ? '' : 's'} expiring`);
    }
    if (stats.leftoversCount > 0) {
      parts.push(`${stats.leftoversCount} leftover${stats.leftoversCount === 1 ? '' : 's'}`);
    }
    if (stats.openSlots > 0) {
      parts.push(`${stats.openSlots} open slot${stats.openSlots === 1 ? '' : 's'}`);
    }
    return parts.join(', ');
  }

  // ---------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------

  private itemToUsesUp(item: { id: UUID; name: string; quantity: number | null; unit: string | null; kind: string; isExpiringSoon?: boolean; expiresAt: string | null }): MealSuggestionUsesUp {
    return {
      itemId: item.id,
      name: item.name,
      quantity: item.quantity ?? 0,
      unit: item.unit,
      kind: item.kind === 'leftover' ? 'leftover'
        : (item.isExpiringSoon ?? false) ? 'expiring'
        : 'inventory',
      expiresAt: item.expiresAt,
    };
  }

  private effortFor(prepTimeMinutes: number): EffortLevel {
    if (prepTimeMinutes <= 10) return 'low';
    if (prepTimeMinutes <= 30) return 'medium';
    return 'high';
  }

  private reasonKindFor(message: string): MealSuggestionReasonKind {
    const lower = message.toLowerCase();
    if (lower.includes('leftover')) return 'leftover';
    if (lower.includes('expiring')) return 'expiry';
    if (lower.includes('fits') || lower.includes('taste') || lower.includes('affinity')) return 'affinity';
    if (lower.includes('recently') || lower.includes('exposure')) return 'exposure';
    if (lower.includes('effort') || lower.includes('quick') || lower.includes('easy')) return 'effort';
    if (lower.includes('already used')) return 'variety';
    return 'affinity';
  }

  private daysBetween(isoDateA: string, isoDateB: string): number {
    const a = new Date(isoDateA.length <= 10 ? `${isoDateA}T00:00:00Z` : isoDateA);
    const b = new Date(isoDateB.length <= 10 ? `${isoDateB}T00:00:00Z` : isoDateB);
    return Math.abs(Math.round((b.getTime() - a.getTime()) / 86_400_000));
  }

  private async requireHouseholdId(userId: UUID): Promise<UUID> {
    const household = await this.householdService.getForUser(userId);
    if (!household) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household setup required for meal intelligence',
        statusCode: 404,
        recoverable: true,
      });
    }
    return household.id;
  }
}
