/**
 * PlanningEngine — deterministic first-pass weekly planner.
 *
 * Pipeline (all deterministic, no network):
 *   kitchen candidates -> household safety filter -> exposure/adherence
 *   scoring -> slot assignment (greedy, variety-bounded) -> purchase
 *   shortfall accounting -> allocations -> persistence.
 *
 * The AI service may polish *descriptions* afterwards, but assignment and
 * safety verdicts come from here — reproducible in CI with no API key.
 */
import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import type {
  FoodWorldState,
  InventoryAllocation,
  InventoryItemState,
  MealEvent,
  MealPlan,
  MealRole,
  MealSlot,
  PlanningReason,
  PlanningResult,
  PurchaseSuggestion,
  SlotKey,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { type AllergenKey, findBestMatch, findIngredient } from '../ai/ingredient-db';
import { HouseholdConstraintService } from '../common-table/household-constraint.service';

export type PlanStrategy = 'balance' | 'easy' | 'use_expiring' | 'family_favorites';

export interface PlanParams {
  weekStart: string;
  mealSlots: MealSlot[];
  strategy: PlanStrategy;
  ownerUserId: UUID;
}

interface Candidate {
  source: InventoryItemState;
  recordName: string | null;
  label: string;
  isLeftover: boolean;
  affinity: number;
  isExpiringSoon: boolean;
  prepTimeMinutes: number;
}

const USAGE_PER_MEAL = 1;
const SLOT_ORDER: MealSlot[] = ['dinner', 'lunch', 'breakfast', 'snack'];

function methodFor(item: InventoryItemState, recordName: string | null): string {
  if (item.kind === 'leftover') {
    return item.dishName ? `Reheat ${item.dishName}` : `Leftover ${item.name}`;
  }
  if (recordName) {
    const record = findIngredient(recordName);
    switch (record?.state) {
      case 'cooked':
        return `${capitalize(recordName)} bowl`;
      case 'raw':
        return `Pan-fried ${recordName}`;
      default:
        return `${recordName} skillet`;
    }
  }
  return `Make ${item.name}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class PlanningEngine {
  private readonly models: Db['models'];
  private readonly constraintService: HouseholdConstraintService;

  constructor(models: Db['models'], deps: { constraintService?: HouseholdConstraintService } = {}) {
    this.models = models;
    this.constraintService = deps.constraintService ?? new HouseholdConstraintService();
  }

  async planWeek(world: FoodWorldState, params: PlanParams): Promise<PlanningResult> {
    const reasons: PlanningReason[] = [];

    const candidates = this.buildCandidates(world);

    if (candidates.length === 0) {
      reasons.push({
        kind: 'open_slot',
        message: 'No kitchen items are available this week — the plan stays fully open.',
      });
      return {
        plan: null,
        purchaseSuggestions: this.staplesBasket(world),
        allocations: [],
        reasons,
        confidence: 0.5,
      };
    }

    const slots = this.buildSlots(world, params);
    const usageCounts = new Map<string, number>();
    const weekConcepts = new Set<string>();
    const events: MealEvent[] = [];
    const allocations: InventoryAllocation[] = [];

    for (const slot of slots) {
      const scored = candidates
        .map((candidate) => ({
          candidate,
          ...this.scoreCandidate(candidate, slot, params, usageCounts, weekConcepts, world),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        reasons.push({
          kind: 'open_slot',
          message: `${titleCase(slot.mealSlot)} ${slot.dateKey} stays open — nothing fits.`,
        });
        continue;
      }

      const best = scored[0]!;
      const candidate = best.candidate;
      usageCounts.set(candidate.source.id, (usageCounts.get(candidate.source.id) ?? 0) + 1);
      weekConcepts.add(candidate.label.toLowerCase());

      const ingredients = this.ingredientsFor(candidate);
      const event: MealEvent = {
        id: randomUUID(),
        householdId: world.household!.id,
        planId: null,
        userId: params.ownerUserId,
        dateKey: slot.dateKey,
        mealSlot: slot.mealSlot,
        kind: 'plan',
        concept: methodFor(candidate.source, candidate.recordName),
        conceptType: candidate.isLeftover ? 'leftover' : 'recipe',
        state: 'PLANNED',
        slotStatus: 'OPEN',
        flexible: false,
        horizon: null,
        excludedDays: null,
        preferredDays: null,
        mealRole: this.roleFor(candidate, params),
        ingredients,
        memberIds: world.householdMembers.map((m) => m.id),
        reasons: best.reasons,
        effort: this.effortFor(candidate),
        rawText: null,
        movedFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      events.push(event);

      reasons.push(...best.persistReasons(candidate));
      for (const ingredient of ingredients) {
        allocations.push({
          mealEventId: event.id,
          ingredient,
          quantity: USAGE_PER_MEAL,
          unit: candidate.source.unit ?? null,
        });
      }
    }

    if (events.length === 0) {
      reasons.push({ kind: 'open_slot', message: 'No compatible slots to fill this week.' });
    }

    const plan = await this.persistPlan(world, params, events);

    return {
      plan,
      purchaseSuggestions: this.purchaseNeeds(world, candidates, usageCounts),
      allocations,
      reasons,
      confidence: this.confidenceFor(events.length, slots.length, world),
    };
  }

  private async persistPlan(
    world: FoodWorldState,
    params: PlanParams,
    events: MealEvent[],
  ): Promise<MealPlan> {
    const planId = randomUUID();
    const householdId = world.household!.id;

    const previous = await this.models.MealPlan.findAll({
      where: {
        householdId,
        weekStart: params.weekStart,
        status: { [Op.in]: ['proposed', 'confirmed', 'declined'] },
      },
    });
    const previousIds = previous.map((row) => row.id);
    await this.models.MealEvent.update(
      { planId: null },
      { where: { planId: { [Op.in]: previousIds } } },
    );
    await this.models.MealEvent.destroy({
      where: { planId: { [Op.in]: previousIds }, kind: 'plan' },
    });
    await this.models.MealPlan.update(
      { status: 'superseded' },
      { where: { id: { [Op.in]: previousIds } } },
    );

    const plan = await this.models.MealPlan.create({
      id: planId,
      householdId,
      ownerId: params.ownerUserId,
      status: 'proposed',
      weekStart: params.weekStart,
      source: 'plan_week',
      createdAt: new Date(),
    });

    for (const event of events) {
      await this.models.MealEvent.create({
        id: event.id,
        householdId,
        planId,
        userId: params.ownerUserId,
        dateKey: event.dateKey,
        mealSlot: event.mealSlot,
        kind: 'plan',
        concept: event.concept,
        conceptType: event.conceptType,
        state: event.state,
        slotStatus: event.slotStatus,
        flexible: event.flexible,
        horizon: event.horizon,
        excludedDays: event.excludedDays,
        preferredDays: event.preferredDays,
        mealRole: event.mealRole,
        ingredients: event.ingredients,
        memberIds: event.memberIds,
        reasons: event.reasons,
        effort: event.effort,
        rawText: null,
        movedFrom: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return {
      id: plan.id,
      householdId: plan.householdId,
      status: plan.status as MealPlan['status'],
      weekStart: plan.weekStart,
      source: plan.source as MealPlan['source'],
      meals: events,
      openSlots: this.openSlotsFor(world, events),
      createdAt: plan.createdAt.toISOString(),
    };
  }

  private openSlotsFor(world: FoodWorldState, events: MealEvent[]): SlotKey[] {
    const planned = new Set(events.map((e) => `${e.dateKey}:${e.mealSlot}`));
    return world.openSlots.filter((slot) => !planned.has(`${slot.dateKey}:${slot.mealSlot}`));
  }

  // -- candidate construction -------------------------------------------------

  private buildCandidates(world: FoodWorldState): Candidate[] {
    const candidates: Candidate[] = [];
    for (const item of world.inventory) {
      const isLeftover = item.kind === 'leftover';
      const available = isLeftover ? (item.servings ?? 0) : (item.availableQuantity ?? 0);
      if (available <= 0) continue;

      const record = findBestMatch(item.name);
      if (this.firstBlocker(world, item.name, record?.name ?? null)) continue;

      candidates.push({
        source: item,
        recordName: record?.name ?? null,
        label: item.name,
        isLeftover,
        affinity: this.affinityFor(world, item.name, record?.name ?? item.name),
        isExpiringSoon: item.isExpiringSoon,
        prepTimeMinutes: record?.prepTimeMinutes ?? 15,
      });
    }
    return candidates;
  }

  private buildSlots(world: FoodWorldState, params: PlanParams): SlotKey[] {
    const blocked = new Set(world.blockedSlots.map((slot) => `${slot.dateKey}:${slot.mealSlot}`));
    const slots: SlotKey[] = [];
    for (const dateKey of allWeekDates(params.weekStart)) {
      for (const mealSlot of [...new Set(params.mealSlots)].sort(
        (a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b),
      )) {
        if (blocked.has(`${dateKey}:${mealSlot}`)) continue;
        slots.push({ dateKey, mealSlot });
      }
    }
    return slots;
  }

  private scoreCandidate(
    candidate: Candidate,
    _slot: SlotKey,
    params: PlanParams,
    usageCounts: Map<string, number>,
    weekConcepts: Set<string>,
    world: FoodWorldState,
  ): {
    score: number;
    reasons: string[];
    persistReasons: (candidate: Candidate) => PlanningReason[];
  } {
    let score = 1;
    const reasons: string[] = [];

    score += candidate.affinity * 1.5;
    if (candidate.affinity > 0.2) reasons.push('fits the household taste');

    if (candidate.isExpiringSoon) {
      score += params.strategy === 'use_expiring' ? 3 : 2;
      reasons.push('expiring soon');
    }

    if (candidate.isLeftover) {
      score += 1.5;
      reasons.push('uses a leftover');
    }

    const alreadyUsed = usageCounts.get(candidate.source.id) ?? 0;
    score -= alreadyUsed * 0.8;
    if (alreadyUsed >= 2) reasons.push('already used twice this week');

    if (weekConcepts.has(candidate.label.toLowerCase())) score -= 0.6;

    if (world.mealExposure.includes(candidate.label.toLowerCase())) {
      score += candidate.affinity > 0.6 ? -0.3 : -1.5;
      if (candidate.affinity <= 0.6) reasons.push('had recently');
    }

    if (params.strategy === 'easy' && candidate.prepTimeMinutes <= 10) score += 1.2;

    const persistReasons = (used: Candidate): PlanningReason[] => {
      const out: PlanningReason[] = [];
      if (used.isLeftover) {
        out.push({ kind: 'leftover', message: `Uses leftover ${used.label}.` });
      } else if (used.isExpiringSoon) {
        out.push({ kind: 'expiry', message: `${used.label} expires soon.` });
      } else {
        out.push({
          kind: 'inventory',
          message: `Built around ${used.label} already in the kitchen.`,
        });
      }
      return out;
    };

    return { score, reasons, persistReasons };
  }

  private roleFor(candidate: Candidate, params: PlanParams): MealRole {
    if (candidate.isLeftover) return 'LEFTOVER';
    if (candidate.isExpiringSoon) return 'USE_SOON';
    if (params.strategy === 'easy') return 'LOW_EFFORT';
    if (candidate.affinity > 0.6) return 'FAMILY_FAVORITE';
    return 'BALANCE';
  }

  private effortFor(candidate: Candidate): 'low' | 'medium' | 'high' {
    if (candidate.prepTimeMinutes <= 10) return 'low';
    if (candidate.prepTimeMinutes <= 30) return 'medium';
    return 'high';
  }

  private ingredientsFor(candidate: Candidate): string[] {
    return [candidate.recordName ?? candidate.label.toLowerCase()];
  }

  private affinityFor(world: FoodWorldState, rawName: string, canonical: string): number {
    let total = 0;
    let count = 0;
    for (const member of world.householdMembers) {
      const names = [rawName.toLowerCase(), canonical.toLowerCase()];
      const namesSet = new Set(names);
      let found: number | null = null;
      for (const name of names) {
        const learned = member.learnedIngredientAffinities[name];
        if (learned != null) {
          found = learned;
          break;
        }
      }
      if (found != null) {
        total += found;
      } else {
        const liked = member.likes.some((like) => namesSet.has(like.toLowerCase()));
        const disliked = member.dislikes.some((dislike) => namesSet.has(dislike.toLowerCase()));
        if (liked) total += 0.6;
        else if (disliked) total -= 0.8;
      }
      count += 1;
    }
    return count === 0 ? 0 : total / count;
  }

  private firstBlocker(
    world: FoodWorldState,
    rawName: string,
    canonical: string | null,
  ): string | null {
    for (const member of world.householdMembers) {
      for (const item of [rawName, canonical ?? '']) {
        if (!item) continue;
        const violation = this.constraintService.checkIngredient(item, {
          memberId: member.id,
          displayName: member.displayName,
          initials: member.initials,
          relationship: member.relationship,
          allergies: member.allergies,
          allergyKeys: member.allergies as AllergenKey[],
          dietaryRestrictions: member.dietaryRestrictions,
          avoidIngredients: member.avoidIngredients,
          likes: member.likes,
          dislikes: member.dislikes,
          spiceLevel: member.spiceLevel ?? undefined,
          textures: member.textures ?? [],
          learned: {},
        });
        if (violation) return violation;
      }
    }
    return null;
  }

  // -- accounting ---------------------------------------------------------------

  private purchaseNeeds(
    world: FoodWorldState,
    candidates: Candidate[],
    usageCounts: Map<string, number>,
  ): PurchaseSuggestion[] {
    const needs: PurchaseSuggestion[] = [];
    for (const candidate of candidates) {
      const usage = usageCounts.get(candidate.source.id) ?? 0;
      if (usage === 0) continue;
      const available = candidate.isLeftover
        ? (candidate.source.servings ?? 0)
        : (candidate.source.availableQuantity ?? 0);
      const shortfall = Math.max(0, usage * USAGE_PER_MEAL - available);
      if (shortfall > 0) {
        needs.push({
          id: randomUUID(),
          ingredient: candidate.recordName ?? candidate.source.name,
          shortfall,
          unit: candidate.source.unit ?? null,
          suggestedQuantity: shortfall,
          suggestedUnit: candidate.source.unit ?? null,
          reason: `Short ${shortfall}× for the ${usage} planned recipe${usage === 1 ? '' : 's'} this week`,
        });
      }
    }
    return dedupeById(needs, (n) => n.ingredient.toLowerCase());
  }

  private staplesBasket(world: FoodWorldState): PurchaseSuggestion[] {
    const suggestions: PurchaseSuggestion[] = [
      {
        id: randomUUID(),
        ingredient: 'egg',
        shortfall: 12,
        unit: 'ea',
        suggestedQuantity: 12,
        suggestedUnit: 'ea',
        reason: 'Versatile household kitchen staple',
      },
      {
        id: randomUUID(),
        ingredient: 'rice',
        shortfall: 1,
        unit: 'kg',
        suggestedQuantity: 1,
        suggestedUnit: 'kg',
        reason: 'Base for cooked meals',
      },
      {
        id: randomUUID(),
        ingredient: 'canned tomatoes',
        shortfall: 2,
        unit: 'can',
        suggestedQuantity: 2,
        suggestedUnit: 'can',
        reason: 'Base for tomato sauces',
      },
    ];
    return suggestions.filter(
      (item) => !world.inventory.some((i) => i.name.toLowerCase() === item.ingredient),
    );
  }

  private confidenceFor(filled: number, total: number, world: FoodWorldState): number {
    let confidence = total === 0 ? 0 : filled / total;
    if (world.activeConstraints.length > 0) confidence -= 0.1;
    if (world.mealExposure.length > 0) confidence -= 0.05;
    return Math.min(1, Math.max(0.2, confidence));
  }
}

function allWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dedupeById<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
