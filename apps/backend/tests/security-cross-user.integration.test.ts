/**
 * Cross-user authorization isolation (Subagent 5 - adversarial audit).
 *
 * DB-guarded (skips when TEST_DATABASE_URL is unset). Two independent users
 * exercise every tenant-scoped surface of the app: household members, common
 * table sessions, pantry, meal-memory plan events and rescue decisions.
 *
 * Everything here pins ONE invariant: a resource created by user A must be
 * indistinguishable from "not found" to user B — never a 200, never a 500.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { MealEvent } from '../src/database/models/meal-event.model';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('cross-user authorization isolation (integration)', () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let userIdA = '';
  let householdAId = '';
  let ownerMemberAId = '';
  let sharedMealAId = '';
  let pantryMilkAId = '';
  let planEventAId = '';

  const authA = () => ({ authorization: `Bearer ${tokenA}` });
  const authB = () => ({ authorization: `Bearer ${tokenB}` });

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const regA = await registerTestUser(app);
    const regB = await registerTestUser(app);
    tokenA = regA.token;
    tokenB = regB.token;
    userIdA = regA.userId;

    // A: real household + a converged common-table session.
    const hhA = await app.inject({ method: 'POST', url: '/api/v1/households', headers: authA(), payload: {} });
    expect(hhA.statusCode).toBe(200);
    householdAId = (hhA.json() as { household: { id: string } }).household.id;
    ownerMemberAId =
      (hhA.json() as { household: { members: { id: string }[] } }).household.members[0]?.id ?? '';
    expect(ownerMemberAId).not.toBe('');

    const converge = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: authA(),
      payload: { memberIds: [ownerMemberAId], ingredients: ['chicken', 'rice', 'broccoli'] },
    });
    expect(converge.statusCode).toBe(200);
    const conv = converge.json() as { converged: boolean; sharedMealId: string; status: string };
    expect(conv.converged).toBe(true);
    sharedMealAId = conv.sharedMealId;

    // A: a pantry item.
    const milk = await app.inject({
      method: 'POST',
      url: '/api/v1/pantry',
      headers: authA(),
      payload: { ingredientName: 'milk', quantity: 2 },
    });
    expect(milk.statusCode).toBe(201);
    pantryMilkAId = (milk.json() as { id: string }).id;

    // B: own (empty) household, so every B request runs against a valid tenant.
    const hhB = await app.inject({ method: 'POST', url: '/api/v1/households', headers: authB(), payload: {} });
    expect(hhB.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('B sees their own empty household, not A\'s', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/households/current', headers: authB() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { household: { id: string } | null };
    expect(body.household).not.toBeNull();
    expect(body.household!.id).not.toBe(householdAId);
  });

  it('B cannot converge a table using A\'s household member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: authB(),
      payload: { memberIds: [ownerMemberAId], ingredients: ['chicken', 'rice', 'broccoli'] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('MEMBER_REQUIRED');
  });

  it('B cannot read, start, split, complete or define A\'s shared meal', async () => {
    const probes = [
      { method: 'GET' as const, url: `/api/v1/common-table/${sharedMealAId}` },
      { method: 'POST' as const, url: `/api/v1/common-table/${sharedMealAId}/start` },
      { method: 'POST' as const, url: `/api/v1/common-table/${sharedMealAId}/split` },
    ];
    for (const probe of probes) {
      const res = await app.inject({ method: probe.method, url: probe.url, headers: authB() });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error?: { code?: string } }).error?.code).toBe('SHARED_MEAL_NOT_FOUND');
    }

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealAId}/complete`,
      headers: authB(),
      payload: {},
    });
    expect(complete.statusCode).toBe(404);
    expect((complete.json() as { error?: { code?: string } }).error?.code).toBe('SHARED_MEAL_NOT_FOUND');

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealAId}/feedback`,
      headers: authB(),
      payload: { householdRating: 'loved' },
    });
    expect(feedback.statusCode).toBe(404);
    expect((feedback.json() as { error?: { code?: string } }).error?.code).toBe('SHARED_MEAL_NOT_FOUND');
  });

  it('A can still drive their own session (tenant isolation is per-user, not global)', async () => {
    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealAId}/start`,
      headers: authA(),
    });
    expect(start.statusCode).toBe(200);
    expect((start.json() as { status: string }).status).toBe('cooking');
  });

  it('B cannot delete or use A\'s pantry item', async () => {
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/pantry/${pantryMilkAId}`, headers: authB() });
    expect(del.statusCode).toBe(404);
    expect((del.json() as { error?: { code?: string } }).error?.code).toBe('PANTRY_ITEM_NOT_FOUND');

    const use = await app.inject({ method: 'POST', url: `/api/v1/pantry/${pantryMilkAId}/use`, headers: authB() });
    expect(use.statusCode).toBe(404);
    expect((use.json() as { error?: { code?: string } }).error?.code).toBe('PANTRY_ITEM_NOT_FOUND');

    // A's item still exists and still has its full quantity.
    const aPantry = await app.inject({ method: 'GET', url: '/api/v1/pantry', headers: authA() });
    const item = (aPantry.json() as { ingredients: { id: string; quantity: number | null }[] }).ingredients.find(
      (i) => i.id === pantryMilkAId,
    );
    expect(Number(item?.quantity)).toBe(2);
  });

  it('B cannot see A\'s household members', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/households/current', headers: authB() });
    const body = res.json() as { household: { members: { id: string }[] } };
    expect(body.household.members.map((m) => m.id)).not.toContain(ownerMemberAId);
  });

  it('B cannot mutate A\'s meal-memory plan events', async () => {
    // Deterministically seed A with one planned meal via the real model layer;
    // the route-level loadEventRow must still isolate it behind A's household.
    planEventAId = randomUUID();
    await MealEvent.create({
      id: planEventAId,
      householdId: householdAId,
      planId: null,
      userId: userIdA,
      dateKey: '2026-10-05',
      mealSlot: 'dinner',
      kind: 'plan',
      concept: 'Pasta',
      conceptType: 'recipe',
      state: 'PLANNED',
      slotStatus: 'OPEN',
      flexible: false,
    });

    const week = await app.inject({ method: 'GET', url: '/api/v1/meal-memory/week?weekStart=2026-10-05', headers: authA() });
    expect(week.statusCode).toBe(200);
    const grid = week.json() as { days: { slots: { planned: { id: string } | null }[] }[] };
    const plannedSlot = grid.days.flatMap((d) => d.slots).find((s) => s.planned);
    expect(plannedSlot?.planned?.id).toBe(planEventAId);

    for (const step of [
      { method: 'POST' as const, url: `/api/v1/meal-memory/meals/${planEventAId}/move`, payload: { dateKey: '2026-10-06' } },
      { method: 'POST' as const, url: `/api/v1/meal-memory/meals/${planEventAId}/remove`, payload: {} },
      { method: 'PATCH' as const, url: `/api/v1/meal-memory/meals/${planEventAId}`, payload: { concept: 'hacked' } },
    ]) {
      const res = await app.inject({ method: step.method, url: step.url, headers: authB(), payload: step.payload });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error?: { code?: string } }).error?.code).toBe('MEAL_EVENT_NOT_FOUND');
    }

    // And B's own calendar never shows A's plan.
    const bWeek = await app.inject({ method: 'GET', url: '/api/v1/meal-memory/week?weekStart=2026-10-05', headers: authB() });
    expect(bWeek.statusCode).toBe(200);
    const bGrid = bWeek.json() as { days: { slots: { planned: { id: string } | null }[] }[] };
    expect(bGrid.days.flatMap((d) => d.slots).filter((s) => s.planned)).toHaveLength(0);
  });

  it('B cannot make decisions against A\'s (or random) rescues', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/rescue/${randomUUID()}/decide`,
      headers: authB(),
      payload: { action: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error?: { code?: string } }).error?.code).toBe('RESCUE_NOT_FOUND');
  });

  it('B cannot modify A\'s household members', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/households/members/${ownerMemberAId}`,
      headers: authB(),
      payload: { displayName: 'hacked' },
    });
    expect(patch.statusCode).toBe(404);
    expect((patch.json() as { error?: { code?: string } }).error?.code).toBe('MEMBER_NOT_FOUND');

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/households/members/${ownerMemberAId}`, headers: authB() });
    expect(del.statusCode).toBe(404);
    expect((del.json() as { error?: { code?: string } }).error?.code).toBe('MEMBER_NOT_FOUND');
  });
});