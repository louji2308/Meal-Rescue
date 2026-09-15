import { describe, expect, it } from '@jest/globals';

import type { FoodWorldState, InventoryItemState, MealEvent } from '@meal-rescue/shared-types';

import type { Db } from '../../src/database/models';
import { type PlanParams, PlanningEngine } from '../../src/services/meal-memory/planning-engine';

const H1 = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';
const ALEX = '33333333-3333-3333-3333-333333333333';
const DANA = '44444444-4444-4444-4444-444444444444';
const SIM = '55555555-5555-5555-5555-555555555555';
const WEEK = '2026-09-07';

let counter = 0;

function item(overrides: Partial<InventoryItemState>): InventoryItemState {
  return {
    id: overrides.id ?? `inv-${++counter}`,
    name: overrides.name ?? 'chicken',
    quantity: overrides.quantity ?? 2,
    unit: overrides.unit ?? 'ea',
    expiresAt: overrides.expiresAt ?? null,
    daysUntilExpiry: overrides.daysUntilExpiry ?? null,
    isExpiringSoon: overrides.isExpiringSoon ?? false,
    kind: overrides.kind ?? 'pantry',
    dishName: overrides.dishName ?? null,
    servings: overrides.servings ?? null,
    madeAt: overrides.madeAt ?? null,
    reservedQuantity: overrides.reservedQuantity ?? 0,
    availableQuantity: overrides.availableQuantity ?? overrides.quantity ?? 2,
  };
}

function planEvent(overrides: Partial<MealEvent>): MealEvent {
  return {
    id: `ev-${++counter}`,
    householdId: H1,
    planId: null,
    userId: OWNER,
    dateKey: null,
    mealSlot: 'dinner',
    kind: 'plan',
    concept: null,
    conceptType: null,
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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function worldState(): FoodWorldState {
  return {
    household: { id: H1, name: 'Our Table', ownerId: OWNER },
    householdMembers: [
      {
        id: ALEX,
        displayName: 'Alex',
        initials: 'AL',
        relationship: 'partner',
        allergies: [],
        dietaryRestrictions: [],
        avoidIngredients: [],
        likes: [],
        dislikes: [],
        spiceLevel: null,
        textures: [],
        learnedIngredientAffinities: {},
      },
      {
        id: DANA,
        displayName: 'Dana',
        initials: 'DA',
        relationship: 'self',
        allergies: [],
        dietaryRestrictions: [],
        avoidIngredients: [],
        likes: [],
        dislikes: [],
        spiceLevel: null,
        textures: [],
        learnedIngredientAffinities: {},
      },
      {
        id: SIM,
        displayName: 'Sim',
        initials: 'SI',
        relationship: 'child',
        allergies: [],
        dietaryRestrictions: [],
        avoidIngredients: [],
        likes: [],
        dislikes: [],
        spiceLevel: null,
        textures: [],
        learnedIngredientAffinities: {},
      },
    ],
    inventory: [
      item({ name: 'chicken', quantity: 3 }),
      item({ name: 'rice', quantity: 4 }),
      item({ name: 'broccoli', quantity: 4 }),
      item({ name: 'canned chickpeas', quantity: 4 }),
      item({ name: 'firm tofu', quantity: 3 }),
      item({ name: 'pasta', quantity: 3 }),
      item({ name: 'canned tuna', quantity: 1 }),
      item({ name: 'egg', quantity: 6 }),
    ],
    expiringItems: [],
    leftovers: [],
    plannedMeals: [],
    actualMeals: [],
    openSlots: [],
    blockedSlots: [],
    availability: [],
    activeConstraints: [],
    recentMeals: [],
    mealExposure: [],
    explicitRules: [],
    learnedPreferences: [],
    purchaseNeeds: [],
  };
}

function fakeDb() {
  let nextPlanId = 1;
  let nextEventId = 1;
  const createdEvents: Array<Record<string, unknown>> = [];
  const MealPlan = {
    findAll: async () => [] as unknown[],
    update: async () => [1] as unknown[],
    create: async () => ({
      id: `plan-${nextPlanId++}`,
      householdId: H1,
      ownerId: OWNER,
      status: 'proposed',
      weekStart: WEEK,
      source: 'plan_week',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    }),
  };
  const MealEvent = {
    findAll: async () => [] as unknown[],
    update: async () => [1] as unknown[],
    destroy: async () => 1,
    create: async (attrs: Record<string, unknown>) => {
      createdEvents.push(attrs);
      return {
        id: `ev-${nextEventId++}`,
        householdId: H1,
        dateKey: attrs.dateKey,
        mealSlot: attrs.mealSlot,
        concept: attrs.concept,
        state: attrs.state ?? 'PLANNED',
        slotStatus: attrs.slotStatus ?? 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };
  return {
    models: { MealPlan, MealEvent } as unknown as Db['models'],
    createdEvents,
  };
}

function planParams(): PlanParams {
  return {
    weekStart: WEEK,
    mealSlots: ['dinner'],
    strategy: 'balance',
    ownerUserId: OWNER,
  };
}

describe('PlanningEngine member scoping', () => {
  it('stamps the scoped memberIds onto every planned event', async () => {
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(worldState(), {
      ...planParams(),
      memberIds: [ALEX],
    });

    expect(result.plan!.meals).toHaveLength(7);
    for (const meal of result.plan!.meals) {
      expect(meal.memberIds).toEqual([ALEX]);
    }
  });

  it('defaults to all household members when no memberIds are passed', async () => {
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(worldState(), planParams());

    expect(result.plan!.meals).toHaveLength(7);
    for (const meal of result.plan!.meals) {
      expect(meal.memberIds).toEqual([ALEX, DANA, SIM]);
    }
  });
});

describe('PlanningEngine intent-held slot protection', () => {
  it('does not double-book a slot the household scheduled directly via intent', async () => {
    const world = worldState();
    world.plannedMeals = [
      planEvent({
        planId: null,
        dateKey: '2026-09-08',
        mealSlot: 'dinner',
        concept: 'Butter chicken',
      }),
    ];
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    expect(result.plan!.meals).toHaveLength(6); // 7 - 1 intent-held
    expect(
      result.plan!.meals.some(
        (m) => m.dateKey === '2026-09-08' && m.mealSlot === 'dinner',
      ),
    ).toBe(false);
  });

  it('protects open-kept placeholder slots that are not plan-owned', async () => {
    const world = worldState();
    world.plannedMeals = [
      planEvent({
        planId: null,
        dateKey: '2026-09-08',
        mealSlot: 'dinner',
        conceptType: 'blocked',
        state: 'BLOCKED',
        slotStatus: 'BLOCKED',
      }),
    ];
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    expect(result.plan!.meals).toHaveLength(6);
  });

  it('still replaces plan-owned slots (they are superseded wholesale on replan)', async () => {
    const world = worldState();
    world.plannedMeals = [
      planEvent({
        planId: 'plan-old',
        dateKey: '2026-09-08',
        mealSlot: 'dinner',
        concept: 'Old plan meal',
      }),
    ];
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    expect(result.plan!.meals).toHaveLength(7);
  });
});