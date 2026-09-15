import { describe, expect, it } from '@jest/globals';

import type { Db } from '../../src/database/models';
import { AccountingService } from '../../src/services/meal-memory/accounting.service';

const H1 = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';
const RULE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function ruleRow(overrides: Partial<Record<string, unknown>> = {}) {
  const plain: Record<string, unknown> = {
    id: RULE_ID,
    householdId: H1,
    memberId: null,
    userId: OWNER,
    scope: 'household',
    instructionType: 'HOLD_INGREDIENT',
    ingredient: 'egg',
    mealSlot: null,
    detail: null,
    priorityGroup: 3,
    active: true,
    appliesFrom: null,
    expiresAt: null,
    note: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
  return {
    get: (key?: string | { plain: true }) =>
      key == null || typeof key === 'object' ? plain : plain[key],
    update: async (attrs: Record<string, unknown>) => {
      Object.assign(plain, attrs);
      return plain;
    },
  };
}

function fakeDb(options: {
  rule?: ReturnType<typeof ruleRow> | null;
  otherActiveRules?: number;
} = {}) {
  const reservationUpdates: Array<{ attrs: Record<string, unknown>; where: Record<string, unknown> }> =
    [];
  const ruleUpdates: Array<Record<string, unknown>> = [];
  const rule = options.rule
    ? {
        ...options.rule,
        update: async (attrs: Record<string, unknown>) => {
          ruleUpdates.push(attrs);
          return options.rule!.update(attrs);
        },
      }
    : null;
  const MealRule = {
    findOne: async () => rule,
    count: async () => options.otherActiveRules ?? 0,
    update: async (attrs: Record<string, unknown>) => {
      ruleUpdates.push(attrs);
      return [1];
    },
  };
  const InventoryReservation = {
    update: async (attrs: Record<string, unknown>, where: Record<string, unknown>) => {
      reservationUpdates.push({ attrs, where });
      return [1];
    },
  };
  return {
    models: { MealRule, InventoryReservation } as unknown as Db['models'],
    reservationUpdates,
    ruleUpdates,
  };
}

describe('AccountingService.deactivateRule', () => {
  it('releases the paired HOLD reservation when no other rule holds the ingredient', async () => {
    const rule = ruleRow();
    const db = fakeDb({ rule });
    const service = new AccountingService(db.models);

    const result = await service.deactivateRule(H1, RULE_ID);

    expect(result.active).toBe(false);
    expect(db.ruleUpdates).toEqual([{ active: false }]);
    expect(db.reservationUpdates).toHaveLength(1);
    expect(db.reservationUpdates[0]!.where).toEqual({
      where: {
        householdId: H1,
        active: true,
        ingredient: 'egg',
        purpose: 'HOLD',
      },
    });
  });

  it('keeps the reservation when another active rule still uses the ingredient', async () => {
    const rule = ruleRow();
    const db = fakeDb({ rule, otherActiveRules: 1 });
    const service = new AccountingService(db.models);

    const result = await service.deactivateRule(H1, RULE_ID);

    expect(result.active).toBe(false);
    expect(db.reservationUpdates).toHaveLength(0);
  });

  it('never touches reservations for non-ingredient rules', async () => {
    const rule = ruleRow({ instructionType: 'BLOCK_SLOT', mealSlot: 'dinner', ingredient: null });
    const db = fakeDb({ rule });
    const service = new AccountingService(db.models);

    await service.deactivateRule(H1, RULE_ID);

    expect(db.reservationUpdates).toHaveLength(0);
  });

  it('is idempotent for an already-inactive rule', async () => {
    const rule = ruleRow({ active: false });
    const db = fakeDb({ rule });
    const service = new AccountingService(db.models);

    const result = await service.deactivateRule(H1, RULE_ID);

    expect(result.active).toBe(false);
    expect(db.ruleUpdates).toHaveLength(0);
    expect(db.reservationUpdates).toHaveLength(0);
  });

  it('throws RULE_NOT_FOUND for an unknown or foreign-household rule', async () => {
    const db = fakeDb({ rule: null });
    const service = new AccountingService(db.models);

    await expect(service.deactivateRule(H1, RULE_ID)).rejects.toMatchObject({
      code: 'RULE_NOT_FOUND',
      statusCode: 404,
    });
  });
});