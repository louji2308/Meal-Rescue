import { describe, expect, it } from '@jest/globals';
import { Op } from 'sequelize';

import type { FoodWorldState } from '@meal-rescue/shared-types';

import type { Db } from '../../src/database/models';
import { HouseholdService } from '../../src/services/common-table/household.service';
import { AccountingService } from '../../src/services/meal-memory/accounting.service';
import { MealMemoryService } from '../../src/services/meal-memory/meal-memory.service';
import { MemoryLearningService } from '../../src/services/meal-memory/memory-learning.service';
import { PlanningEngine } from '../../src/services/meal-memory/planning-engine';
import { WorldStateService } from '../../src/services/meal-memory/world-state.service';

const H1 = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';

const FROM = '2026-09-07';
const TO = '2026-09-14';

let counter = 0;

function eventRow(overrides: Partial<Record<string, unknown>>) {
  const plain: Record<string, unknown> = {
    id: `src-${++counter}`,
    householdId: H1,
    planId: null,
    userId: OWNER,
    dateKey: '2026-09-08',
    mealSlot: 'dinner',
    kind: 'plan',
    concept: 'Taco night',
    conceptType: 'recipe',
    state: 'PLANNED',
    slotStatus: 'OPEN',
    flexible: false,
    horizon: null,
    excludedDays: null,
    preferredDays: null,
    mealRole: 'VARIETY',
    ingredients: ['beef', 'tortillas'],
    memberIds: null,
    reasons: null,
    effort: 'medium',
    rawText: null,
    movedFrom: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
  return {
    get: () => plain,
    update: async (attrs: Record<string, unknown>) => {
      Object.assign(plain, attrs);
      return plain;
    },
    destroy: async () => 1,
  };
}

function fakeService(options: {
  sourceRows?: Array<Record<string, unknown>>;
  targetRows?: Array<Record<string, unknown>>;
}) {
  const eventCreates: Array<Record<string, unknown>> = [];
  const eventUpdates: Array<{ attrs: Record<string, unknown>; where: Record<string, unknown> }> = [];
  const eventDestroys: Array<Record<string, unknown>> = [];
  const planCreates: Array<Record<string, unknown>> = [];
  const planUpdates: Array<{ attrs: Record<string, unknown>; where: Record<string, unknown> }> = [];

  const MealEvent = {
    findAll: async (opts: { where: Record<string, unknown> }) => {
      const gte = (opts.where.dateKey as { [Op.gte]?: string })?.[Op.gte] as string | undefined;
      if (gte === FROM) return options.sourceRows ?? [];
      if (gte === TO) return options.targetRows ?? [];
      return [];
    },
    create: async (attrs: Record<string, unknown>) => {
      eventCreates.push(attrs);
      return { id: attrs.id as string };
    },
    update: async (attrs: Record<string, unknown>, where: Record<string, unknown>) => {
      eventUpdates.push({ attrs, where });
      return [1];
    },
    destroy: async (where: Record<string, unknown>) => {
      eventDestroys.push(where);
      return 1;
    },
  };
  const MealPlan = {
    create: async (attrs: Record<string, unknown>) => {
      planCreates.push(attrs);
      return { id: attrs.id as string, createdAt: new Date('2026-09-02T00:00:00Z') };
    },
    update: async (attrs: Record<string, unknown>, where: Record<string, unknown>) => {
      planUpdates.push({ attrs, where });
      return [1];
    },
  };
  const worldStateService = {
    getState: async () => ({ openSlots: [] }) as unknown as FoodWorldState,
  };
  const householdService = {
    getForUser: async () => ({ id: H1, name: 'Our Table', ownerId: OWNER }),
  };

  const service = new MealMemoryService({
    models: { MealEvent, MealPlan } as unknown as Db['models'],
    worldStateService: worldStateService as unknown as WorldStateService,
    planningEngine: {} as PlanningEngine,
    memoryLearningService: {} as MemoryLearningService,
    accountingService: {} as AccountingService,
    householdService: householdService as unknown as HouseholdService,
    aiService: null,
  });

  return {
    service,
    eventCreates,
    eventUpdates,
    eventDestroys,
    planCreates,
    planUpdates,
  };
}

describe('MealMemoryService.reuseWeek', () => {
  it('copies last week’s plan events to the shifted slots and marks the old plan superseded', async () => {
    const db = fakeService({
      sourceRows: [
        eventRow({ id: 'src-a', dateKey: '2026-09-08', mealSlot: 'dinner', concept: 'Taco night' }),
        eventRow({ id: 'src-b', dateKey: '2026-09-09', mealSlot: 'dinner', concept: 'Pasta bake' }),
      ],
      targetRows: [
        eventRow({
          id: 'tgt-plan',
          planId: 'plan-A',
          dateKey: '2026-09-15',
          mealSlot: 'dinner',
          concept: 'Old plan',
        }),
      ],
    });

    const response = await db.service.reuseWeek(OWNER, {
      fromWeekStart: FROM,
      toWeekStart: TO,
    });

    expect(response.copied).toHaveLength(2);
    const shifted = response.copied.map((e) => e.dateKey).sort();
    expect(shifted).toEqual(['2026-09-15', '2026-09-16']);
    for (const meal of response.copied) {
      expect(meal.planId).not.toBeNull();
      expect(meal.state).toBe('PLANNED');
      expect(meal.slotStatus).toBe('OPEN');
      expect(meal.memberIds).toBeNull();
    }
    // Old plan-owned events are detached, destroyed, and the plan superseded.
    expect(db.eventDestroys).toHaveLength(1);
    expect(db.eventDestroys[0]!.where).toMatchObject({ planId: { [Op.in]: ['plan-A'] } });
    expect(db.planUpdates).toHaveLength(1);
    expect(db.planUpdates[0]!.attrs).toEqual({ status: 'superseded' });
    // New plan row is a "replan".
    expect(db.planCreates[0]).toMatchObject({ weekStart: TO, source: 'replan', status: 'proposed' });
  });

  it('never overwrites a slot the household scheduled directly via intent', async () => {
    const db = fakeService({
      sourceRows: [
        eventRow({ id: 'src-a', dateKey: '2026-09-08', mealSlot: 'dinner', concept: 'Taco night' }),
        eventRow({ id: 'src-b', dateKey: '2026-09-09', mealSlot: 'dinner', concept: 'Pasta bake' }),
      ],
      targetRows: [
        eventRow({
          id: 'tgt-intent',
          planId: null,
          dateKey: '2026-09-15',
          mealSlot: 'dinner',
          concept: 'Chosen by intent',
          state: 'PLANNED',
        }),
      ],
    });

    const response = await db.service.reuseWeek(OWNER, {
      fromWeekStart: FROM,
      toWeekStart: TO,
    });

    // 2026-09-15 dinner is intent-held → only the 09-16 slot is copied.
    expect(response.copied).toHaveLength(1);
    expect(response.copied[0]!.dateKey).toBe('2026-09-16');
    expect(response.copied[0]!.concept).toBe('Pasta bake');
  });

  it('skips events that are not reusable (flexible placeholders, eaten meals)', async () => {
    const db = fakeService({
      sourceRows: [
        eventRow({ id: 'good', dateKey: '2026-09-08', mealSlot: 'dinner', concept: 'Soup' }),
        eventRow({
          id: 'flex',
          dateKey: '2026-09-09',
          mealSlot: 'dinner',
          concept: null,
          conceptType: 'flexible',
          state: 'OPEN',
        }),
        eventRow({
          id: 'eaten',
          dateKey: '2026-09-10',
          mealSlot: 'dinner',
          concept: 'Already eaten',
          state: 'EATEN',
        }),
      ],
    });

    const response = await db.service.reuseWeek(OWNER, {
      fromWeekStart: FROM,
      toWeekStart: TO,
    });

    expect(response.copied).toHaveLength(1);
    expect(response.copied[0]!.concept).toBe('Soup');
  });
});