/**
 * WorldStateService — assembles the Situation Model: a read-only snapshot
 * of everything Meal Memory knows about a household's food life, in one
 * object consumed by the deterministic planning engine and by the AI
 * refinement layer. No writes here — memory is change-only.
 */
import { Op } from 'sequelize';

import type {
  FoodWorldState,
  InventoryItemState,
  LearnedPreference,
  LeftoverState,
  MealEvent,
  MealRule,
  MemberMemoryContext,
  PurchaseSuggestion,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { HouseholdConstraintService } from '../common-table/household-constraint.service';
import { HouseholdTasteService } from '../common-table/household-taste.service';
import { HouseholdService } from '../common-table/household.service';
import { PantryService } from '../pantry.service';
import { TasteExposureService } from '../taste-exposure.service';
import { toMealEvent, toMealRule } from './mappers';

const WORLD_WINDOW_DAYS_BEFORE = 7;
const WORLD_WINDOW_DAYS_AFTER = 21;

export class WorldStateService {
  private readonly models: Db['models'];
  private readonly pantryService: PantryService;
  private readonly householdService: HouseholdService;
  private readonly householdTasteService: HouseholdTasteService;
  private readonly constraintService: HouseholdConstraintService;
  private readonly exposureService: TasteExposureService;

  constructor(
    models: Db['models'],
    deps: {
      pantryService: PantryService;
      householdService: HouseholdService;
      householdTasteService: HouseholdTasteService;
      constraintService?: HouseholdConstraintService;
      exposureService: TasteExposureService;
    },
  ) {
    this.models = models;
    this.pantryService = deps.pantryService;
    this.householdService = deps.householdService;
    this.householdTasteService = deps.householdTasteService;
    this.constraintService = deps.constraintService ?? new HouseholdConstraintService();
    this.exposureService = deps.exposureService;
  }

  async getState(householdId: UUID, ownerUserId: UUID): Promise<FoodWorldState> {
    const household = await this.models.Household.findByPk(householdId);
    const members = await this.models.HouseholdMember.findAll({
      where: { householdId, active: true },
    });
    const memberIds = members.map((m) => m.id as string);

    const memberContexts = await this.householdTasteService.buildContext(memberIds);
    const memberMemory = this.toMemberMemory(memberContexts);

    const [pantryResponse, plannedMeals, actualMeals, ruleRows, reservations, recentlyAteRows] =
      await Promise.all([
        this.pantryService.getPantry(ownerUserId),
        this.mealsInWindow(householdId, 'plan'),
        this.mealsInWindow(householdId, 'actual'),
        this.models.MealRule.findAll({
          where: { householdId, active: true },
        }),
        this.models.InventoryReservation.findAll({
          where: {
            householdId,
            active: true,
            expiresAt: { [Op.or]: [{ [Op.is]: null }, { [Op.gte]: this.todayKey() }] },
          },
        }),
        this.models.MealEvent.findAll({
          where: { householdId, kind: 'actual' },
          order: [['dateKey', 'DESC']],
          limit: 14,
        }),
      ]);

    const rules = ruleRows.map(toMealRule);
    const recentlyAte = recentlyAteRows.map(toMealEvent);

    const reservedByIngredient = new Map<string, number>();
    for (const reservation of reservations) {
      const key = (reservation.ingredient ?? '').toLowerCase();
      const qty =
        reservation.reservedQuantity == null ? Infinity : Number(reservation.reservedQuantity);
      reservedByIngredient.set(key, (reservedByIngredient.get(key) ?? 0) + qty);
    }

    const inventory: InventoryItemState[] = pantryResponse.ingredients.map((item) => {
      const reserved = reservedByIngredient.get(item.ingredientName.toLowerCase()) ?? 0;
      const available = item.quantity == null ? null : Math.max(0, item.quantity - reserved);
      return {
        id: item.id,
        name: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        expiresAt: item.expiresAt,
        daysUntilExpiry: item.daysUntilExpiry,
        isExpiringSoon: item.isExpiringSoon,
        kind: item.kind,
        dishName: item.dishName,
        servings: item.servings,
        madeAt: item.madeAt,
        reservedQuantity: reserved,
        availableQuantity: available,
      };
    });

    const leftovers: LeftoverState[] = inventory
      .filter((item) => item.kind === 'leftover')
      .map((item) => ({
        name: item.name,
        dishName: item.dishName ?? item.name,
        servings: item.servings,
        madeAt: item.madeAt,
        expiresAt: item.expiresAt,
        notes: null,
      }));

    const expiringItems = pantryResponse.expiringSoon.map((item) => ({
      id: item.id,
      name: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      expiresAt: item.expiresAt,
      daysUntilExpiry: item.daysUntilExpiry,
      isExpiringSoon: true,
      kind: item.kind,
      dishName: item.dishName,
      servings: item.servings,
      madeAt: item.madeAt,
      reservedQuantity: reservedByIngredient.get(item.ingredientName.toLowerCase()) ?? 0,
      availableQuantity: item.quantity,
    }));

    const openSlots = plannedMeals
      .filter((m) => m.slotStatus === 'OPEN' && m.dateKey)
      .map((m) => ({ dateKey: m.dateKey!, mealSlot: m.mealSlot }));

    // Slot-level rules (BLOCK_SLOT, KEEP_OUT, KEEP_OPEN) freeze planning out
    // of those calendar positions, on top of any event rows already marking
    // them blocked/out/open-kept.
    const blockedByRules = this.blockedSlotsFromRules(rules);
    const blockedSlots = [
      ...plannedMeals
        .filter((m) => (m.slotStatus === 'BLOCKED' || m.slotStatus === 'OUT') && m.dateKey)
        .map((m) => ({ dateKey: m.dateKey!, mealSlot: m.mealSlot })),
      ...blockedByRules,
    ];

    const activeConstraints = this.toActiveConstraints(rules, reservations, memberMemory);

    const overexposed = await this.overexposedFor(ownerUserId, recentlyAte);

    const learnedPreferences = await this.learnedPreferences(memberIds);

    return {
      household: household
        ? { id: household.id, name: household.name ?? 'Our Table', ownerId: household.ownerId }
        : null,
      householdMembers: memberMemory,
      inventory,
      expiringItems,
      leftovers,
      plannedMeals,
      actualMeals,
      openSlots,
      blockedSlots,
      availability: this.availabilityFromRules(rules),
      activeConstraints,
      recentMeals: recentlyAte,
      mealExposure: overexposed,
      explicitRules: rules,
      learnedPreferences,
      purchaseNeeds: [] as PurchaseSuggestion[],
    };
  }

  private async mealsInWindow(householdId: UUID, kind: 'plan' | 'actual'): Promise<MealEvent[]> {
    const from = this.dateKeyForOffset(-WORLD_WINDOW_DAYS_BEFORE);
    const to = this.dateKeyForOffset(WORLD_WINDOW_DAYS_AFTER);
    const rows = await this.models.MealEvent.findAll({
      where: { householdId, kind, dateKey: { [Op.gte]: from, [Op.lte]: to } },
      order: [
        ['dateKey', 'ASC'],
        ['mealSlot', 'ASC'],
      ],
    });
    return rows.map(toMealEvent);
  }

  private async overexposedFor(ownerUserId: UUID, recentlyAte: MealEvent[]): Promise<string[]> {
    const fromExposure = await this.exposureService.getOverexposed(ownerUserId, 7);
    const fromHistory = new Set<string>();
    for (const meal of recentlyAte) {
      for (const ingredient of meal.ingredients ?? []) {
        fromHistory.add(ingredient.toLowerCase());
      }
    }
    const counts = new Map<string, number>();
    for (const meal of recentlyAte) {
      for (const ingredient of meal.ingredients ?? []) {
        const key = ingredient.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const overexposed = new Set<string>(fromExposure.map((i) => i.toLowerCase()));
    for (const [key, count] of counts) {
      if (count >= 2) overexposed.add(key);
    }
    void fromHistory;
    return [...overexposed].slice(0, 30);
  }

  private async learnedPreferences(memberIds: UUID[]): Promise<LearnedPreference[]> {
    if (memberIds.length === 0) return [];
    const rows = await this.models.HouseholdPreference.findAll({
      where: { memberId: { [Op.in]: memberIds } },
    });
    return rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        memberId: plain.memberId,
        ingredient: plain.ingredient,
        affinity: Number(plain.affinity ?? 0),
        confidence: Number(plain.confidence ?? 0),
        source: Number(plain.confidence ?? 0) >= 0.9 ? 'declared' : 'learned',
      };
    });
  }

  private toMemberMemory(
    contexts: Awaited<ReturnType<HouseholdTasteService['buildContext']>>,
  ): MemberMemoryContext[] {
    return contexts.map((context) => ({
      id: context.memberId,
      displayName: context.displayName,
      initials: context.initials,
      relationship: context.relationship,
      allergies: context.allergyKeys ?? [],
      dietaryRestrictions: context.dietaryRestrictions ?? [],
      avoidIngredients: context.avoidIngredients ?? [],
      likes: context.likes ?? [],
      dislikes: context.dislikes ?? [],
      spiceLevel: context.spiceLevel ?? null,
      textures: context.textures ?? null,
      learnedIngredientAffinities: context.learned ?? {},
    }));
  }

  private toActiveConstraints(
    rules: MealRule[],
    reservations: Array<{ ingredient: string | null; purpose: string }>,
    members: MemberMemoryContext[],
  ): FoodWorldState['activeConstraints'] {
    const constraints: FoodWorldState['activeConstraints'] = [];

    for (const member of members) {
      for (const allergy of member.allergies) {
        constraints.push({
          source: 'member',
          memberId: member.id,
          ingredient: allergy,
          mealSlot: null,
          kind: 'allergy',
          description: `${allergy} — allergic for ${member.displayName}`,
          priorityGroup: 5,
        });
      }
      for (const avoid of member.avoidIngredients) {
        constraints.push({
          source: 'member',
          memberId: member.id,
          ingredient: avoid,
          mealSlot: null,
          kind: 'avoid',
          description: `${avoid} — avoided by ${member.displayName}`,
          priorityGroup: 5,
        });
      }
    }

    for (const rule of rules) {
      constraints.push({
        source: 'rule',
        memberId: rule.memberId,
        ingredient: rule.ingredient,
        mealSlot: rule.mealSlot,
        kind: rule.instructionType,
        description:
          rule.note ?? `${rule.instructionType}${rule.ingredient ? `: ${rule.ingredient}` : ''}`,
        priorityGroup: rule.priorityGroup,
      });
    }

    for (const reservation of reservations) {
      if (!reservation.ingredient) continue;
      constraints.push({
        source: 'reservation',
        memberId: null,
        ingredient: reservation.ingredient.toLowerCase(),
        mealSlot: null,
        kind: 'held',
        description: `${reservation.ingredient} held by reservation`,
        priorityGroup: 4,
      });
    }

    return constraints;
  }

  /** BLOCK_SLOT / KEEP_OUT / KEEP_OPEN rules freeze a (day, slot) pair. */
  private blockedSlotsFromRules(
    rules: MealRule[],
  ): { dateKey: string; mealSlot: import('@meal-rescue/shared-types').MealSlot }[] {
    const blocked: { dateKey: string; mealSlot: import('@meal-rescue/shared-types').MealSlot }[] =
      [];
    for (const rule of rules) {
      if (!['BLOCK_SLOT', 'KEEP_OUT', 'KEEP_OPEN'].includes(rule.instructionType)) continue;
      if (!rule.mealSlot) continue;
      const detail = (rule.detail ?? {}) as Record<string, unknown>;
      const date = rule.appliesFrom ?? (detail.dateKey as string | undefined) ?? null;
      const days = Array.isArray(detail.days) ? (detail.days as string[]) : date ? [date] : [];
      for (const day of days) {
        blocked.push({ dateKey: String(day), mealSlot: rule.mealSlot });
      }
    }
    return blocked;
  }

  private availabilityFromRules(rules: MealRule[]): FoodWorldState['availability'] {
    const availability: FoodWorldState['availability'] = [];
    for (const rule of rules) {
      if (rule.instructionType !== 'AVAILABILITY') continue;
      if (!rule.memberId) continue;
      const detail = (rule.detail ?? {}) as Record<string, unknown>;
      const from = rule.appliesFrom ?? (detail.dateKey as string | undefined) ?? null;
      const days = Array.isArray(detail.days)
        ? (detail.days as string[])
        : detail.day != null
          ? [String(detail.day)]
          : [];
      const present = detail.present !== false;
      for (const day of days.length > 0 ? days : from ? [from] : []) {
        availability.push({ memberId: rule.memberId, dateKey: String(day), present });
      }
    }
    return availability;
  }

  private dateKeyForOffset(days: number): string {
    return dayKey(nowDateOffset(days));
  }

  private todayKey(): string {
    return dateKeyForLocal();
  }
}

function nowDateOffset(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function dateKeyForLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
