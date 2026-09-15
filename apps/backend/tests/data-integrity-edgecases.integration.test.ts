/**
 * Data-integrity & edge cases (Subagent 5 - adversarial audit).
 *
 * DB-guarded (skips when TEST_DATABASE_URL is unset). Pins idempotency,
 * destroy-not-decrement semantics, single-row uniqueness, ghost-member
 * references after member removal, and kitchen fallback behavior.
 *
 * Weeks are isolated so planner/event tests never collide:
 *   2026-09-14  double plan-week (planner-owned events)
 *   2026-10-05  move/remove direct-created plan events (planId null)
 *   2026-10-06  record-actual double-POST (kind actual)
 *   2026-10-12  ghost-member pin (planner-owned events)
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { MealEvent } from '../src/database/models/meal-event.model';
import { MealPlan } from '../src/database/models/meal-plan.model';
import { SharedMealMember } from '../src/database/models/shared-meal-member.model';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

interface PantryItem {
  id: string;
  ingredientName: string;
  quantity: number | null;
  expiresAt: string | null;
  isExpiringSoon?: boolean;
  lastUsedAt?: string | null;
}

describeDb('data-integrity edge cases (integration)', () => {
  let app: FastifyInstance;
  let token = '';
  let userId = '';
  let householdId = '';
  let ownerMemberId = '';

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function postPantry(payload: Record<string, unknown>): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/v1/pantry', headers: auth(), payload });
    expect(res.statusCode).toBe(201);
    return (res.json() as { id: string }).id;
  }

  async function getPantry(): Promise<PantryItem[]> {
    const res = await app.inject({ method: 'GET', url: '/api/v1/pantry', headers: auth() });
    expect(res.statusCode).toBe(200);
    return (res.json() as { ingredients: PantryItem[] }).ingredients ?? [];
  }

  async function planEventsForWeek(
    weekStart: string,
  ): Promise<InstanceType<typeof MealEvent>[]> {
    const plans = await MealPlan.findAll({ where: { householdId, weekStart, status: 'proposed' } });
    if (plans.length === 0) return [];
    const events = await MealEvent.findAll({
      where: { householdId, kind: 'plan', planId: plans[0]?.id ?? null },
    });
    return events.map((e) => e as unknown as InstanceType<typeof MealEvent>).filter(Boolean);
  }

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;
    userId = registration.userId;

    const hh = await app.inject({ method: 'POST', url: '/api/v1/households', headers: auth(), payload: {} });
    expect(hh.statusCode).toBe(200);
    householdId = (hh.json() as { household: { id: string } }).household.id;
    ownerMemberId = (hh.json() as { household: { members: { id: string }[] } }).household.members[0]?.id ?? '';
    expect(ownerMemberId).not.toBe('');
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('re-seeding the household is idempotent; member double-create yields distinct ids', async () => {
    const again = await app.inject({ method: 'POST', url: '/api/v1/households', headers: auth(), payload: {} });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { household: { id: string } }).household.id).toBe(householdId);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: auth(),
      payload: { displayName: 'Taylor', relationship: 'partner' },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: auth(),
      payload: { displayName: 'Taylor', relationship: 'partner' },
    });
    expect(second.statusCode).toBe(200);
    const id1 = (first.json() as { member: { id: string } }).member.id;
    const id2 = (second.json() as { member: { id: string } }).member.id;
    expect(id1).not.toBe(id2);
  });

  it('double converge creates two independent sessions, each with exactly the selected members', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: auth(),
      payload: { memberIds: [ownerMemberId], ingredients: ['chicken', 'rice', 'broccoli'] },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: auth(),
      payload: { memberIds: [ownerMemberId], ingredients: ['chicken', 'rice', 'broccoli'] },
    });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const idA = (a.json() as { sharedMealId: string }).sharedMealId;
    const idB = (b.json() as { sharedMealId: string }).sharedMealId;
    expect(idA).not.toBe(idB);

    const [rowsA, rowsB] = await Promise.all([
      SharedMealMember.findAll({ where: { sharedMealId: idA } }),
      SharedMealMember.findAll({ where: { sharedMealId: idB } }),
    ]);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.get('memberId')).toBe(ownerMemberId);
  });

  it('double plan-week never double-books a slot and supersedes the prior plan', async () => {
    for (const item of ['chicken', 'rice', 'broccoli', 'soy sauce']) {
      await postPantry({ ingredientName: item, quantity: 4 });
    }

    const run1 = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/plan-week',
      headers: auth(),
      payload: { weekStart: '2026-09-14' },
    });
    expect(run1.statusCode).toBe(200);
    expect((await planEventsForWeek('2026-09-14')).length).toBeGreaterThan(0);

    const run2 = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/plan-week',
      headers: auth(),
      payload: { weekStart: '2026-09-14' },
    });
    expect(run2.statusCode).toBe(200);

    const plans = await MealPlan.findAll({ where: { householdId, weekStart: '2026-09-14' } });
    const active = plans.filter((p) => p.get('status') === 'proposed');
    const superseded = plans.filter((p) => p.get('status') === 'superseded');
    expect(active).toHaveLength(1);
    expect(superseded).toHaveLength(1);

    const events = await planEventsForWeek('2026-09-14');
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(14);
    const slotKeys = events.map((e) => `${e.get('dateKey')}|${e.get('mealSlot')}`);
    expect(new Set(slotKeys).size).toBe(slotKeys.length);
  });

  it('always-replanned slot is unique; every plan event carries the owner memberId', async () => {
    const events = await planEventsForWeek('2026-09-14');
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      const memberIds = (e.get('memberIds') as string[] | null) ?? [];
      expect(memberIds).toContain(ownerMemberId);
    }
  });

  it('move is idempotent, refuses an occupied slot with 409, and remove is idempotent', async () => {
    const e1 = randomUUID();
    const e2 = randomUUID();
    for (const [id, dateKey, slot] of [
      [e1, '2026-10-05', 'dinner'],
      [e2, '2026-10-05', 'lunch'],
    ] as const) {
      await MealEvent.create({
        id,
        householdId,
        planId: null,
        userId,
        dateKey,
        mealSlot: slot,
        kind: 'plan',
        concept: 'Pasta',
        conceptType: 'recipe',
        state: 'PLANNED',
        slotStatus: 'OPEN',
        flexible: false,
      });
    }

    // Free move to a new slot.
    const moved = await app.inject({
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${e1}/move`,
      headers: auth(),
      payload: { dateKey: '2026-10-06', mealSlot: 'dinner' },
    });
    expect(moved.statusCode).toBe(200);
    expect((moved.json() as { event: { state: string } }).event.state).toBe('MOVED');

    // Repeating the same move is a no-op (same target, last-wins).
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${e1}/move`,
      headers: auth(),
      payload: { dateKey: '2026-10-06', mealSlot: 'dinner' },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject(moved.json());

    // Moving onto an occupied slot is rejected (does not clobber leftovers).
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${e1}/move`,
      headers: auth(),
      payload: { dateKey: '2026-10-05', mealSlot: 'lunch' },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error?: { code?: string } }).error?.code).toBe('SLOT_OCCUPIED');

    // Remove then remove again: idempotent, does not 404 or double-delete.
    const removed = await app.inject({
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${e2}/remove`,
      headers: auth(),
    });
    expect(removed.statusCode).toBe(200);
    expect((removed.json() as { event: { state: string } }).event.state).toBe('CANCELLED');

    const removedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${e2}/remove`,
      headers: auth(),
    });
    expect(removedAgain.statusCode).toBe(200);
    expect(removedAgain.json()).toMatchObject(removed.json());

    const row = await MealEvent.findByPk(e2);
    expect(row?.get('state')).toBe('CANCELLED');
    expect(row?.get('slotStatus')).toBe('OPEN');
  });

  it('double record-actual yields one actual row for the slot', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/record-actual',
      headers: auth(),
      payload: { dateKey: '2026-10-06', mealSlot: 'dinner', concept: 'Shepherd pie' },
    });
    expect(first.statusCode).toBe(200);
    const id1 = (first.json() as { event: { id: string } }).event.id;

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/record-actual',
      headers: auth(),
      payload: { dateKey: '2026-10-06', mealSlot: 'dinner', concept: 'Shepherd pie' },
    });
    expect(second.statusCode).toBe(200);
    const id2 = (second.json() as { event: { id: string } }).event.id;
    expect(id2).toBe(id1);

    const rows = await MealEvent.findAll({
      where: { householdId, dateKey: '2026-10-06', mealSlot: 'dinner', kind: 'actual' },
    });
    expect(rows).toHaveLength(1);
  });

  it('pantry quantity 1 "use" destroys the row; reuse 404s; uncounted items never decrement', async () => {
    const milkId = await postPantry({ ingredientName: 'milk', quantity: 1 });

    const use = await app.inject({ method: 'POST', url: `/api/v1/pantry/${milkId}/use`, headers: auth() });
    expect(use.statusCode).toBe(200);
    const body = use.json() as { removed: boolean; item: unknown };
    expect(body.removed).toBe(true);
    expect(body.item).toBeNull();

    const reuse = await app.inject({ method: 'POST', url: `/api/v1/pantry/${milkId}/use`, headers: auth() });
    expect(reuse.statusCode).toBe(404);
    expect((reuse.json() as { error?: { code?: string } }).error?.code).toBe('PANTRY_ITEM_NOT_FOUND');

    const items = await getPantry();
    expect(items.some((i) => i.ingredientName === 'milk')).toBe(false);

    const saltId = await postPantry({ ingredientName: 'salt' });
    const saltUse = await app.inject({ method: 'POST', url: `/api/v1/pantry/${saltId}/use`, headers: auth() });
    expect(saltUse.statusCode).toBe(200);
    expect((saltUse.json() as { removed: boolean }).removed).toBe(false);

    const after = await getPantry();
    const salt = after.find((i) => i.id === saltId);
    expect(salt).toBeDefined();
    expect(salt?.quantity).toBeNull();
    expect(salt?.lastUsedAt).toBeTruthy();
  });

  it('expiring-soon flags: only near-future expiry is flagged, already-expired is not', async () => {
    const twoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const expired = new Date(Date.now() - 86_400_000).toISOString();

    const breadId = await postPantry({ ingredientName: 'bread', quantity: 2, expiresAt: twoDays });
    await postPantry({ ingredientName: 'yogurt', quantity: 2, expiresAt: expired });
    await postPantry({ ingredientName: 'oatmeal', quantity: 2 });

    const items = await getPantry();
    expect(items.find((i) => i.id === breadId)?.isExpiringSoon).toBe(true);
    expect(items.find((i) => i.ingredientName === 'yogurt')?.isExpiringSoon).toBe(false);
    expect(items.find((i) => i.ingredientName === 'oatmeal')?.isExpiringSoon).toBe(false);
  });

  it('member removal leaves plan events\' memberIds untouched (pin) and replanning recovers', async () => {
    const pat = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: auth(),
      payload: { displayName: 'Pat', relationship: 'child' },
    });
    expect(pat.statusCode).toBe(200);
    const patId = (pat.json() as { member: { id: string } }).member.id;

    const plan = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/plan-week',
      headers: auth(),
      payload: { weekStart: '2026-10-12' },
    });
    expect(plan.statusCode).toBe(200);

    const eventsBefore = await planEventsForWeek('2026-10-12');
    expect(eventsBefore.length).toBeGreaterThan(0);
    expect(
      eventsBefore.every((e) => ((e.get('memberIds') as string[]) ?? []).includes(patId)),
    ).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/households/members/${patId}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(200);

    const hh = await app.inject({ method: 'GET', url: '/api/v1/households/current', headers: auth() });
    const memberIds = (hh.json() as { household: { members: { id: string }[] } }).household.members.map((m) => m.id);
    expect(memberIds).not.toContain(patId);

    // Pinned current behavior: the DB plan events still reference the removed member.
    const eventsAfter = await planEventsForWeek('2026-10-12');
    expect(eventsAfter.length).toBeGreaterThan(0);
    expect(((eventsAfter[0]?.get('memberIds') as string[]) ?? []).includes(patId)).toBe(true);

    // Replanning produces a clean plan scoped to surviving members and does not crash.
    const replan = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/plan-week',
      headers: auth(),
      payload: { weekStart: '2026-10-12' },
    });
    expect(replan.statusCode).toBe(200);
    const eventsReplanned = await planEventsForWeek('2026-10-12');
    expect(eventsReplanned.length).toBeGreaterThan(0);
    for (const e of eventsReplanned) {
      expect((e.get('memberIds') as string[]) ?? []).not.toContain(patId);
    }
  });

  it('kitchen: empty pantry answers immediately, keyless identify falls back to "food item"', async () => {
    const starter = await registerTestUser(app);
    const starterAuth = () => ({ authorization: `Bearer ${starter.token}` });

    const none = await app.inject({
      method: 'POST',
      url: '/api/v1/kitchen/what-can-i-make',
      headers: starterAuth(),
      payload: {},
    });
    expect(none.statusCode).toBe(200);
    expect((none.json() as { ideas: unknown[] }).ideas).toHaveLength(0);

    const some = await app.inject({
      method: 'POST',
      url: '/api/v1/kitchen/what-can-i-make',
      headers: auth(),
      payload: {},
    });
    expect(some.statusCode).toBe(200);
    const ideas = (some.json() as { ideas: { recipeName?: string; reason?: string }[] }).ideas;
    expect(ideas.length).toBe(2);
    for (const idea of ideas) {
      expect(typeof idea.recipeName).toBe('string');
      expect(typeof idea.reason).toBe('string');
    }

    const identified = await app.inject({
      method: 'POST',
      url: '/api/v1/kitchen/identify',
      headers: auth(),
      payload: { imageBase64: 'a'.repeat(100) },
    });
    expect(identified.statusCode).toBe(200);
    const foods = (identified.json() as { foods: { name: string; confidence: number }[] }).foods;
    expect(foods).toHaveLength(1);
    expect(foods[0]?.name).toBe('food item');
    expect(foods[0]?.confidence).toBe(0.3);
  });
});