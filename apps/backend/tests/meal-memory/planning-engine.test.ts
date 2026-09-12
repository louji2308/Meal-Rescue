import { describe, expect, it } from '@jest/globals';

import type { FoodWorldState, InventoryItemState } from '@meal-rescue/shared-types';

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
        likes: ['chicken'],
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
        allergies: ['fish'],
        dietaryRestrictions: [],
        avoidIngredients: ['fish'],
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
        allergies: ['eggs'],
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
      item({ name: 'chicken', quantity: 3, isExpiringSoon: true, availableQuantity: 3 }),
      item({ name: 'rice', quantity: 4, availableQuantity: 4 }),
      item({ name: 'broccoli', quantity: 4, availableQuantity: 4 }),
      item({ name: 'canned chickpeas', quantity: 4, availableQuantity: 4 }),
      item({ name: 'firm tofu', quantity: 3, availableQuantity: 3 }),
      item({ name: 'pasta', quantity: 3, availableQuantity: 3 }),
      item({ name: 'canned tuna', quantity: 1, availableQuantity: 1 }), // Dana blocks
      item({ name: 'egg', quantity: 6, availableQuantity: 6 }), // Sim blocks
    ],
    expiringItems: [],
    leftovers: [
      {
        name: 'roast',
        dishName: 'Sunday roast',
        servings: 2,
        madeAt: null,
        expiresAt: null,
        notes: null,
      },
    ],
    plannedMeals: [],
    actualMeals: [],
    openSlots: [],
    blockedSlots: [],
    availability: [],
    activeConstraints: [
      {
        source: 'member',
        memberId: DANA,
        ingredient: 'fish',
        mealSlot: null,
        kind: 'allergy',
        description: 'fish — allergic for Dana',
        priorityGroup: 5,
      },
      {
        source: 'member',
        memberId: SIM,
        ingredient: 'egg',
        mealSlot: null,
        kind: 'allergy',
        description: 'egg — allergic for Sim',
        priorityGroup: 5,
      },
    ],
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
        status: attrs.status ?? 'PLANNED',
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

describe('PlanningEngine', () => {
  it('fills every requested slot when the kitchen covers it', async () => {
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(worldState(), planParams());

    expect(result.plan).not.toBeNull();
    expect(result.plan!.meals).toHaveLength(7); // 7 dinners
    for (const meal of result.plan!.meals) {
      expect(meal.dateKey).not.toBeNull();
      expect(meal.concept).toBeTruthy();
      expect(meal.slotStatus).toBe('OPEN');
    }
    expect(db.createdEvents).toHaveLength(7);
  });

  it('never assigns an ingredient blocked by an allergy or avoid list', async () => {
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(worldState(), planParams());

    for (const meal of result.plan!.meals) {
      for (const ingredient of meal.ingredients ?? []) {
        expect(ingredient).not.toBe('canned tuna');
        expect(ingredient).not.toBe('egg');
      }
    }
    for (const meal of result.plan!.meals) {
      const event = db.createdEvents.find(
        (e) => e.mealSlot === meal.mealSlot && e.dateKey === meal.dateKey,
      );
      expect(event).toBeDefined();
    }
  });

  it('uses expiring ingredients as a priority when strategy demands it', async () => {
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(worldState(), {
      ...planParams(),
      strategy: 'use_expiring',
    });
    const chickenMeals = result.plan!.meals.filter((m) =>
      (m.ingredients ?? []).includes('rotisserie chicken'),
    );
    expect(chickenMeals.length).toBeGreaterThanOrEqual(1);
  });

  it('reports a purchase shortfall when planned usage exceeds what is available', async () => {
    const world = worldState();
    world.inventory = world.inventory.map((i) =>
      i.name === 'chicken' ? { ...i, quantity: 1, availableQuantity: 1 } : i,
    );
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    const chickenShortage = result.purchaseSuggestions.find((p) =>
      p.ingredient.toLowerCase().includes('chicken'),
    );
    expect(chickenShortage).toBeDefined();
    expect(chickenShortage!.shortfall).toBeGreaterThan(0);
  });

  it('returns an open plan with a staple basket when the kitchen is empty', async () => {
    const world = worldState();
    world.inventory = [];
    world.leftovers = [];
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    expect(result.plan).toBeNull();
    expect(result.purchaseSuggestions.length).toBeGreaterThanOrEqual(3);
    expect(result.purchaseSuggestions.some((p) => p.ingredient === 'egg')).toBe(true);
    expect(db.createdEvents).toHaveLength(0);
  });

  it('does not overwrite blocked slots', async () => {
    const world = worldState();
    world.blockedSlots = [
      { dateKey: '2026-09-07', mealSlot: 'dinner' },
      { dateKey: '2026-09-08', mealSlot: 'dinner' },
    ];
    const db = fakeDb();
    const engine = new PlanningEngine(db.models);
    const result = await engine.planWeek(world, planParams());

    expect(result.plan!.meals).toHaveLength(5); // 7 - 2 blocked
  });
});
