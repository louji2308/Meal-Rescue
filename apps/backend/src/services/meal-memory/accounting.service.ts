/**
 * AccountingService — explicit inventory reservations + generated allocations.
 *
 * "Don't use the eggs yet" and "save the chicken for Sunday" become
 * InventoryReservation rows the planner subtracts from availability before it
 * assigns any candidate, so a HOLD is never silently consumed by a plan.
 */
import { randomUUID } from 'node:crypto';

import { Op } from 'sequelize';

import type {
  InventoryReservation,
  MealMemoryCreateRuleRequest,
  MealRule,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';

export class AccountingService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  /** Create a rule, and a paired reservation when the instruction reserves inventory. */
  async createRule(input: {
    householdId: UUID;
    userId: UUID;
    request: MealMemoryCreateRuleRequest;
  }): Promise<{ rule: MealRule; reservation: InventoryReservation | null }> {
    const { householdId, userId, request } = input;
    const rule = await this.models.MealRule.create({
      id: randomUUID(),
      householdId,
      userId,
      memberId: request.memberId ?? null,
      scope: request.scope ?? 'household',
      instructionType: request.instructionType,
      ingredient: request.ingredient?.trim().toLowerCase() ?? null,
      mealSlot: request.mealSlot ?? null,
      detail: request.detail ?? null,
      priorityGroup: request.priorityGroup ?? 3,
      active: true,
      appliesFrom: request.appliesFrom ?? null,
      expiresAt: request.expiresAt ?? null,
      note: request.note ?? null,
      createdAt: new Date(),
    });

    let reservation: InventoryReservation | null = null;
    if (
      ('HOLD_INGREDIENT' === request.instructionType ||
        'RESERVE_INGREDIENT' === request.instructionType) &&
      request.ingredient
    ) {
      reservation = await this.createReservation({
        householdId,
        userId,
        ingredient: request.ingredient,
        reservedQuantity: request.detail?.quantity as number | undefined,
        unit: request.detail?.unit as string | undefined,
        purpose: 'HOLD',
        expiresAt: request.expiresAt ?? null,
      });
    }

    return { rule: this.toRule(rule), reservation };
  }

  async createReservation(input: {
    householdId: UUID;
    userId: UUID;
    ingredient: string;
    reservedQuantity?: number | null;
    unit?: string | null;
    purpose?: 'HOLD' | 'RESERVE_MEAL' | 'ALLOCATION';
    mealEventId?: UUID | null;
    expiresAt?: string | null;
  }): Promise<InventoryReservation> {
    const row = await this.models.InventoryReservation.create({
      id: randomUUID(),
      householdId: input.householdId,
      userId: input.userId,
      ingredient: input.ingredient.trim().toLowerCase(),
      reservedQuantity: input.reservedQuantity ?? null,
      unit: input.unit ?? null,
      purpose: input.purpose ?? 'HOLD',
      mealEventId: input.mealEventId ?? null,
      active: true,
      expiresAt: input.expiresAt ?? null,
      createdAt: new Date(),
    });
    return {
      id: row.id,
      householdId: row.householdId,
      userId: row.userId,
      ingredient: row.ingredient,
      reservedQuantity: row.reservedQuantity == null ? null : Number(row.reservedQuantity),
      unit: row.unit ?? null,
      purpose: row.purpose as InventoryReservation['purpose'],
      mealEventId: row.mealEventId ?? null,
      active: row.active,
      expiresAt: row.expiresAt ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async activeRules(householdId: UUID): Promise<MealRule[]> {
    const rows = await this.models.MealRule.findAll({
      where: { householdId, active: true },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => this.toRule(row));
  }

  async activeReservations(householdId: UUID): Promise<InventoryReservation[]> {
    const rows = await this.models.InventoryReservation.findAll({
      where: { householdId, active: true },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row) => ({
      id: row.id,
      householdId: row.householdId,
      userId: row.userId,
      ingredient: row.ingredient,
      reservedQuantity: row.reservedQuantity == null ? null : Number(row.reservedQuantity),
      unit: row.unit ?? null,
      purpose: row.purpose as InventoryReservation['purpose'],
      mealEventId: row.mealEventId ?? null,
      active: row.active,
      expiresAt: row.expiresAt ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Expire any reservation whose expiry has passed. Returns released count. */
  async releaseExpiredReservations(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const [affected] = await this.models.InventoryReservation.update(
      { active: false },
      { where: { active: true, expiresAt: { [Op.lt]: today } } },
    );
    return affected;
  }

  private toRule(row: InstanceType<Db['models']['MealRule']>): MealRule {
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
      createdAt: plain.createdAt.toISOString(),
    };
  }
}
