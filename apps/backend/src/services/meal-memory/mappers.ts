/**
 * Model → contract mappers for Meal Memory tables.
 * Keeps row-shape knowledge in one place (world state + orchestrator both
 * render MealEvent objects).
 */
import type { MealEvent, MealPlan, MealRule } from '@meal-rescue/shared-types';

type MealEventRow = InstanceType<import('../../database/models').Db['models']['MealEvent']>;
type MealPlanRow = InstanceType<import('../../database/models').Db['models']['MealPlan']>;
type MealRuleRow = InstanceType<import('../../database/models').Db['models']['MealRule']>;

export function toMealEvent(row: MealEventRow): MealEvent {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    householdId: plain.householdId,
    planId: plain.planId ?? null,
    userId: plain.userId,
    dateKey: plain.dateKey ?? null,
    mealSlot: plain.mealSlot as MealEvent['mealSlot'],
    kind: plain.kind as MealEvent['kind'],
    concept: plain.concept ?? null,
    conceptType: plain.conceptType as MealEvent['conceptType'],
    state: plain.state as MealEvent['state'],
    slotStatus: plain.slotStatus as MealEvent['slotStatus'],
    flexible: plain.flexible,
    horizon: plain.horizon ?? null,
    excludedDays: plain.excludedDays ?? null,
    preferredDays: plain.preferredDays ?? null,
    mealRole: plain.mealRole as MealEvent['mealRole'],
    ingredients: plain.ingredients ?? null,
    memberIds: plain.memberIds ?? null,
    reasons: plain.reasons ?? null,
    effort: plain.effort as MealEvent['effort'],
    rawText: plain.rawText ?? null,
    movedFrom: (plain.movedFrom ?? null) as MealEvent['movedFrom'],
    createdAt: (plain.createdAt as Date).toISOString(),
    updatedAt: ((plain.updatedAt ?? plain.createdAt) as Date).toISOString(),
  };
}

export function toMealPlan(
  row: MealPlanRow,
  meals: MealEvent[] = [],
  openSlots: MealPlan['openSlots'] = [],
): MealPlan {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    householdId: plain.householdId,
    status: plain.status as MealPlan['status'],
    weekStart: plain.weekStart,
    source: plain.source as MealPlan['source'],
    meals,
    openSlots,
    createdAt: (plain.createdAt as Date).toISOString(),
  };
}

export function toMealRule(row: MealRuleRow): MealRule {
  const plain = row.get({ plain: true });
  return {
    id: plain.id,
    householdId: plain.householdId,
    memberId: plain.memberId ?? null,
    userId: plain.userId,
    scope: plain.scope as MealRule['scope'],
    instructionType: plain.instructionType as MealRule['instructionType'],
    ingredient: plain.ingredient ?? null,
    mealSlot: plain.mealSlot ?? null,
    detail: plain.detail ?? null,
    priorityGroup: Number(plain.priorityGroup) as MealRule['priorityGroup'],
    active: plain.active,
    appliesFrom: plain.appliesFrom ?? null,
    expiresAt: plain.expiresAt ?? null,
    note: plain.note ?? null,
    createdAt: (plain.createdAt as Date).toISOString(),
  };
}
