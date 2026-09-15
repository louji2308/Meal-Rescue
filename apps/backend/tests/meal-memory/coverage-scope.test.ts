import { describe, expect, it } from '@jest/globals';

import type { FoodWorldState, MealEvent, MealSlot } from '@meal-rescue/shared-types';

import { narrowCoverageForMember } from '../../src/services/meal-memory/world-state.service';

const H1 = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';
const ALEX = '33333333-3333-3333-3333-333333333333';
const DANA = '44444444-4444-4444-4444-444444444444';

function event(overrides: Partial<MealEvent>): MealEvent {
  return {
    id: overrides.id ?? 'ev',
    householdId: H1,
    planId: null,
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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseWorld(): FoodWorldState {
  return {
    household: { id: H1, name: 'Our Table', ownerId: OWNER },
    householdMembers: [],
    inventory: [],
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

function slots(world: FoodWorldState): { dateKey: string; mealSlot: MealSlot }[] {
  return world.plannedMeals
    .filter((m) => m.slotStatus === 'OPEN' && m.dateKey)
    .map((m) => ({ dateKey: m.dateKey!, mealSlot: m.mealSlot }));
}

describe('narrowCoverageForMember', () => {
  it('returns the world untouched when no member is selected', () => {
    const world = baseWorld();
    world.plannedMeals = [event({ memberIds: null })];
    const out = narrowCoverageForMember(world, null);
    expect(out.plannedMeals).toBe(world.plannedMeals);
  });

  it('keeps household-wide events visible to any single member', () => {
    const world = baseWorld();
    world.plannedMeals = [event({ memberIds: null })];
    const out = narrowCoverageForMember(world, ALEX);
    expect(out.plannedMeals).toHaveLength(1);
  });

  it('shows events scoped to the selected member and hides other members’ plans', () => {
    const world = baseWorld();
    world.plannedMeals = [
      event({ id: 'a', memberIds: [ALEX], dateKey: '2026-09-08' }),
      event({ id: 'd', memberIds: [DANA], dateKey: '2026-09-09' }),
      event({ id: 'both', memberIds: [ALEX, DANA], dateKey: '2026-09-10' }),
    ];
    const out = narrowCoverageForMember(world, ALEX);
    expect(out.plannedMeals.map((m) => m.id)).toEqual(['a', 'both']);
  });

  it('hides other members’ actual meals and recents, keeping household ones', () => {
    const world = baseWorld();
    world.actualMeals = [
      event({ id: 'act-a', kind: 'actual', memberIds: [ALEX] }),
      event({ id: 'act-d', kind: 'actual', memberIds: [DANA] }),
      event({ id: 'act-all', kind: 'actual', memberIds: null }),
    ];
    world.recentMeals = [
      event({ id: 'rec-d', memberIds: [DANA], dateKey: '2026-09-01' }),
      event({ id: 'rec-all', memberIds: null, dateKey: '2026-09-02' }),
    ];
    const out = narrowCoverageForMember(world, ALEX);
    expect(out.actualMeals.map((m) => m.id)).toEqual(['act-a', 'act-all']);
    expect(out.recentMeals.map((m) => m.id)).toEqual(['rec-all']);
  });

  it('recomputes openSlots from the narrowed plannedMeals only', () => {
    const world = baseWorld();
    world.plannedMeals = [
      event({ id: 'a-open', memberIds: [ALEX], slotStatus: 'OPEN', dateKey: '2026-09-08' }),
      event({ id: 'd-open', memberIds: [DANA], slotStatus: 'OPEN', dateKey: '2026-09-09' }),
      event({ id: 'd-locked', memberIds: [DANA], slotStatus: 'LOCKED', dateKey: '2026-09-10' }),
    ];
    const out = narrowCoverageForMember(world, ALEX);
    expect(slots(out)).toEqual([{ dateKey: '2026-09-08', mealSlot: 'dinner' }]);
  });
});