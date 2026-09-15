import { describe, expect, it } from '@jest/globals';

import type { AppError } from '../../src/lib/errors';
import type { Db } from '../../src/database/models';
import { HouseholdService } from '../../src/services/common-table/household.service';
import { AccountingService } from '../../src/services/meal-memory/accounting.service';
import { MealMemoryService } from '../../src/services/meal-memory/meal-memory.service';
import { MemoryLearningService } from '../../src/services/meal-memory/memory-learning.service';
import { PlanningEngine } from '../../src/services/meal-memory/planning-engine';
import { WorldStateService } from '../../src/services/meal-memory/world-state.service';

const H1 = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  const plain: Record<string, unknown> = {
    id: EVENT_ID,
    householdId: H1,
    planId: 'plan-1',
    userId: OWNER,
    dateKey: '2026-09-07',
    mealSlot: 'dinner',
    kind: 'plan',
    concept: 'Chili',
    conceptType: 'recipe',
    state: 'PLANNED',
    slotStatus: 'OPEN',
    flexible: false,
    horizon: null,
    excludedDays: null,
    preferredDays: null,
    mealRole: null,
    ingredients: null,
    memberIds: null,
    reasons: null,
    effort: null,
    rawText: null,
    movedFrom: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
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

function fakeService(options: {
  row?: ReturnType<typeof eventRow> | null;
  conflict?: ReturnType<typeof eventRow> | null;
}) {
  const row = options.row ?? null;
  const MealEvent = {
    findOne: async (opts: { where: Record<string, unknown> }) => {
      if ('dateKey' in opts.where) return options.conflict ?? null;
      return row;
    },
  };
  const householdService = {
    getForUser: async () => ({ id: H1, name: 'Our Table', ownerId: OWNER }),
  };
  const service = new MealMemoryService({
    models: { MealEvent } as unknown as Db['models'],
    worldStateService: {} as WorldStateService,
    planningEngine: {} as PlanningEngine,
    memoryLearningService: {} as MemoryLearningService,
    accountingService: {} as AccountingService,
    householdService: householdService as unknown as HouseholdService,
    aiService: null,
  });
  return { service, row };
}

function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  return promise.then(
    () => {
      throw new Error('expected the call to reject');
    },
    (err: unknown) => {
      expect(err).toMatchObject({ statusCode: expect.any(Number) });
      return err as AppError;
    },
  );
}

describe('MealMemoryService.moveMeal guards', () => {
  it('refuses to move a meal in a non-movable lifecycle state', async () => {
    const db = fakeService({ row: eventRow({ state: 'EATEN' }) });
    const err = await expectAppError(
      db.service.moveMeal(OWNER, EVENT_ID, { dateKey: '2026-09-08' }),
    );
    expect(err.code).toBe('EVENT_NOT_MOVABLE');
    expect(err.statusCode).toBe(409);
  });

  it('refuses to move an actual (non-plan) event', async () => {
    const db = fakeService({ row: eventRow({ kind: 'actual' }) });
    const err = await expectAppError(
      db.service.moveMeal(OWNER, EVENT_ID, { dateKey: '2026-09-08' }),
    );
    expect(err.code).toBe('ONLY_PLAN_MOVABLE');
    expect(err.statusCode).toBe(400);
  });

  it('moves a PLANNED meal and marks it MOVED with the old slot recorded', async () => {
    const db = fakeService({ row: eventRow({ state: 'PLANNED' }) });
    const moved = await db.service.moveMeal(OWNER, EVENT_ID, {
      dateKey: '2026-09-08',
      mealSlot: 'lunch',
    });
    expect(moved.state).toBe('MOVED');
    expect(moved.dateKey).toBe('2026-09-08');
    expect(moved.mealSlot).toBe('lunch');
    expect(moved.movedFrom).toEqual({ dateKey: '2026-09-07', mealSlot: 'dinner' });
  });

  it('rejects moves into an occupied planned slot', async () => {
    const db = fakeService({
      row: eventRow({ state: 'PLANNED' }),
      conflict: eventRow({ id: 'other', dateKey: '2026-09-08', mealSlot: 'dinner' }),
    });
    const err = await expectAppError(
      db.service.moveMeal(OWNER, EVENT_ID, { dateKey: '2026-09-08', mealSlot: 'dinner' }),
    );
    expect(err.code).toBe('SLOT_OCCUPIED');
  });
});

describe('MealMemoryService.removeMeal guards', () => {
  it('refuses to cancel a meal that was already eaten or skipped', async () => {
    const db = fakeService({ row: eventRow({ state: 'EATEN' }) });
    const err = await expectAppError(db.service.removeMeal(OWNER, EVENT_ID));
    expect(err.code).toBe('PAST_MEAL_NOT_REMOVABLE');
    expect(err.statusCode).toBe(409);
  });

  it('is idempotent for an already-cancelled meal (double-tap safe)', async () => {
    const db = fakeService({ row: eventRow({ state: 'CANCELLED' }) });
    const result = await db.service.removeMeal(OWNER, EVENT_ID);
    expect(result.state).toBe('CANCELLED');
  });

  it('cancels a PLANNED meal and reopens its slot', async () => {
    const db = fakeService({ row: eventRow({ state: 'PLANNED' }) });
    const result = await db.service.removeMeal(OWNER, EVENT_ID);
    expect(result.state).toBe('CANCELLED');
    expect(result.slotStatus).toBe('OPEN');
  });
});