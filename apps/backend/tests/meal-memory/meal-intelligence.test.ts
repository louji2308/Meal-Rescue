import { describe, expect, it } from '@jest/globals';

import type { FoodWorldState, InventoryItemState } from '@meal-rescue/shared-types';

import type { Db } from '../../src/database/models';
import { HouseholdService } from '../../src/services/common-table/household.service';
import {
  matchGradeFor,
  PlanningEngine,
  scoreToMatchPercent,
} from '../../src/services/meal-memory/planning-engine';
import { MealIntelligenceService } from '../../src/services/meal-memory/meal-intelligence.service';
import { WorldStateService } from '../../src/services/meal-memory/world-state.service';

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
    ],
    expiringItems: [],
    leftovers: [
      {
        name: 'roast',
        dishName: 'Sunday roast',
        servings: 2,
        madeAt: '2026-09-06',
        expiresAt: null,
        notes: null,
      },
    ],
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
  return {} as unknown as Db['models'];
}

function buildService(world: FoodWorldState) {
  const worldStateService = {
    getState: async () => world,
  };
  const householdService = {
    getForUser: async () => ({ id: H1, name: 'Our Table', ownerId: OWNER }),
  };
  const planningEngine = new PlanningEngine(fakeDb());
  const service = new MealIntelligenceService({
    worldStateService: worldStateService as unknown as WorldStateService,
    planningEngine,
    householdService: householdService as unknown as HouseholdService,
  });
  return service;
}

describe('scoreToMatchPercent / matchGradeFor', () => {
  it('clamps to the 2–100 band and grades by threshold', () => {
    expect(scoreToMatchPercent(0)).toBe(2);
    expect(scoreToMatchPercent(0.1)).toBe(2);
    expect(scoreToMatchPercent(6)).toBe(100);
    expect(scoreToMatchPercent(9)).toBe(100);
    expect(scoreToMatchPercent(4.5)).toBe(75);
    expect(scoreToMatchPercent(2.7)).toBe(45);

    expect(matchGradeFor(90)).toBe('high');
    expect(matchGradeFor(75)).toBe('high');
    expect(matchGradeFor(50)).toBe('medium');
    expect(matchGradeFor(44)).toBe('low');
  });
});

describe('MealIntelligenceService.suggestions', () => {
  it('returns ordered suggestions with %-match, reasons, uses-up and fits', async () => {
    const service = buildService(worldState());

    const response = await service.suggestions(OWNER, { weekStart: WEEK });

    expect(response.weekStart).toBe(WEEK);
    expect(response.mealSlot).toBeNull();
    expect(response.suggestions.length).toBeGreaterThanOrEqual(1);

    const suggestions = response.suggestions;
    // Sorted best-first
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1]!.matchPercent).toBeGreaterThanOrEqual(
        suggestions[i]!.matchPercent,
      );
    }
    for (const s of suggestions) {
      expect(s.matchPercent).toBeGreaterThanOrEqual(2);
      expect(s.matchPercent).toBeLessThanOrEqual(100);
      expect(s.matchGrade).toBe(matchGradeFor(s.matchPercent));
      expect(s.concept).toBeTruthy();
      expect(s.usesUp.length).toBeGreaterThanOrEqual(1);
      expect(s.fits.length).toBeGreaterThanOrEqual(1);
      expect(['low', 'medium', 'high']).toContain(s.effort);
    }

    // Chicken is expiring and liked → should outrank stable pantry staples.
    expect(suggestions[0]!.concept.toLowerCase()).toContain('chicken');
  });

  it('filters to a single meal slot when requested', async () => {
    const service = buildService(worldState());

    const response = await service.suggestions(OWNER, { weekStart: WEEK, mealSlot: 'lunch' });

    expect(response.mealSlot).toBe('lunch');
    for (const s of response.suggestions) {
      for (const fit of s.fits) expect(fit.mealSlot).toBe('lunch');
    }
  });

  it('reports world uncovered when the kitchen is empty', async () => {
    const world = worldState();
    world.inventory = [];
    world.leftovers = [];
    const service = buildService(world);

    const response = await service.suggestions(OWNER, { weekStart: WEEK });

    expect(response.suggestions).toHaveLength(0);
    expect(response.basedOn.openSlots).toBe(0);
    expect(response.basedOn.expiringItems).toBe(0);
  });

  it('keeps blocked ingredients (allergy / avoid-list) out of suggestions', async () => {
    const world = worldState();
    world.inventory.push(
      item({ name: 'canned tuna', quantity: 1, availableQuantity: 1 }),
      item({ name: 'egg', quantity: 6, availableQuantity: 6 }),
    );
    world.activeConstraints = [
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
    ];
    const service = buildService(world);

    const response = await service.suggestions(OWNER, { weekStart: WEEK });

    for (const s of response.suggestions) {
      expect(s.concept.toLowerCase()).not.toContain('tuna');
      expect(s.concept.toLowerCase()).not.toContain('egg');
    }
  });
});

describe('MealIntelligenceService.useWhatYouHave', () => {
  it('ranks on-hand meals by urgency + taste, listing what each uses up', async () => {
    const service = buildService(worldState());

    const response = await service.useWhatYouHave(OWNER, { limit: 3 });

    expect(response.ideas.length).toBeLessThanOrEqual(3);
    expect(response.basedOn.inventoryCount).toBe(6);
    expect(response.basedOn.leftoverCount).toBe(1);
    for (const idea of response.ideas) {
      expect(idea.concept).toBeTruthy();
      expect(idea.usesUp).toHaveLength(1);
      expect(idea.usesUp[0]!.name).toBeTruthy();
      expect(idea.estimatedServings).toBeGreaterThanOrEqual(1);
      expect(idea.reasons.length).toBeGreaterThanOrEqual(1);
    }
    // Expiring + liked chicken should lead the list.
    expect(response.ideas[0]!.concept.toLowerCase()).toContain('chicken');
  });

  it('returns no ideas when the kitchen is empty', async () => {
    const world = worldState();
    world.inventory = [];
    world.leftovers = [];
    const service = buildService(world);

    const response = await service.useWhatYouHave(OWNER);

    expect(response.ideas).toHaveLength(0);
  });
});

describe('MealIntelligenceService.summary', () => {
  it('computes planning coverage, expiring soon, leftovers and engagement', async () => {
    const world = worldState();
    world.blockedSlots = [{ dateKey: '2026-09-07', mealSlot: 'dinner' }];
    world.openSlots = [
      { dateKey: '2026-09-08', mealSlot: 'dinner' },
      { dateKey: '2026-09-09', mealSlot: 'dinner' },
    ];
    world.plannedMeals = [
      {
        id: 'meal-1',
        householdId: H1,
        planId: null,
        userId: OWNER,
        dateKey: '2026-09-07',
        mealSlot: 'dinner',
        kind: 'plan',
        concept: 'Chicken rice',
        conceptType: 'recipe',
        state: 'CONFIRMED',
        slotStatus: 'LOCKED',
        flexible: false,
        horizon: null,
        excludedDays: null,
        preferredDays: null,
        mealRole: 'BALANCE',
        ingredients: ['chicken'],
        memberIds: null,
        reasons: null,
        effort: 'medium',
        rawText: null,
        movedFrom: null,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];
    world.actualMeals = [
      {
        id: 'meal-2',
        householdId: H1,
        planId: null,
        userId: OWNER,
        dateKey: '2026-09-07',
        mealSlot: 'dinner',
        kind: 'actual',
        concept: 'Chicken rice',
        conceptType: 'recipe',
        state: 'EATEN',
        slotStatus: 'LOCKED',
        flexible: false,
        horizon: null,
        excludedDays: null,
        preferredDays: null,
        mealRole: 'BALANCE',
        ingredients: ['chicken'],
        memberIds: null,
        reasons: null,
        effort: 'medium',
        rawText: null,
        movedFrom: null,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    const service = buildService(world);
    const response = await service.summary(OWNER, { weekStart: WEEK });

    expect(response.weekStart).toBe(WEEK);
    expect(response.planning).toEqual({
      planned: 1,
      confirmed: 1,
      eaten: 1,
      openSlots: 2,
      blockedSlots: 1,
      coveragePercent: 50,
    });
    expect(response.leftovers).toHaveLength(1);
    expect(response.leftovers[0]).toMatchObject({ name: 'Sunday roast', servings: 2 });
    expect(response.insights.some((i) => i.kind === 'leftover')).toBe(true);
    expect(response.insights.some((i) => i.kind === 'open_slot')).toBe(true);
    expect(response.engagement.recordedMeals).toBe(1);
    expect(response.engagement.plannedMeals).toBe(1);
    expect(response.headline).toContain('1 meal planned');
    expect(response.headline).toContain('2 open slots');
  });

  it('reports expiring items with computed expiry windows', async () => {
    const world = worldState();
    world.expiringItems = [
      item({
        name: 'milk',
        quantity: 1,
        unit: 'L',
        isExpiringSoon: true,
        expiresAt: '2026-09-09',
        daysUntilExpiry: 2,
      }),
    ];
    const service = buildService(world);

    const response = await service.summary(OWNER, { weekStart: WEEK });

    expect(response.expiringSoon).toHaveLength(1);
    expect(response.expiringSoon[0]).toMatchObject({
      name: 'milk',
      quantity: 1,
      unit: 'L',
      expiresInDays: 2,
    });
    expect(response.insights.some((i) => i.kind === 'expiry')).toBe(true);
  });

  it('provides a highlight tied to the top suggestion when one exists', async () => {
    const service = buildService(worldState());

    const response = await service.summary(OWNER, { weekStart: WEEK });

    expect(response.highlight).not.toBeNull();
    expect(response.highlight!.concept).toBeTruthy();
    expect(response.highlight!.message).toBeTruthy();
  });

  it('returns empty highlight with an empty kitchen', async () => {
    const world = worldState();
    world.inventory = [];
    world.leftovers = [];
    const service = buildService(world);

    const response = await service.summary(OWNER, { weekStart: WEEK });

    expect(response.highlight).toBeNull();
    expect(response.headline).toContain('No meals planned');
  });
});