import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { HouseholdPreference } from '../src/database/models/household-preference.model';
import { SharedMealMember } from '../src/database/models/shared-meal-member.model';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('common table routes (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let householdId = '';
  let ownerMemberId = '';
  let peanutMemberId = '';

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('creates a household with the owner member (idempotent)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/households',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const body = first.json() as {
      household: { id: string; members: { id: string; isOwner: boolean }[] };
    };
    householdId = body.household.id;
    ownerMemberId = body.household.members[0]?.id ?? '';
    expect(ownerMemberId).not.toBe('');

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/households',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { household: { id: string } }).household.id).toBe(householdId);
  });

  it('adds a member profile with a peanut allergy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        displayName: 'Alex',
        relationship: 'partner',
        constraints: { allergies: ['peanut'] },
        preferences: { spiceLevel: 'mild' },
      },
    });
    expect(res.statusCode).toBe(200);
    const member = (res.json() as { member: { id: string; relationship: string } }).member;
    peanutMemberId = member.id;
    expect(member.relationship).toBe('partner');
  });

  it('converges a truly shared safe meal for the household', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        memberIds: [ownerMemberId, peanutMemberId],
        ingredients: ['peanuts', 'rice', 'chicken', 'broccoli'],
        ingredientSource: 'text',
      },
    });
    expect(res.statusCode).toBe(200);
    const result = res.json() as {
      sharedMealId: string;
      converged: boolean;
      plan: { ingredients: string[] } | null;
      blockedIngredients: string[];
    };
    expect(result.converged).toBe(true);
    expect(result.plan?.ingredients ?? []).not.toContain('peanuts');
    expect(result.blockedIngredients).toContain('peanuts');
  });

  it('walks the cooking lifecycle: start → split → complete', async () => {
    const spouse = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        memberIds: [ownerMemberId, peanutMemberId],
        ingredients: ['chicken', 'rice', 'broccoli'],
        ingredientSource: 'text',
      },
    });
    const { sharedMealId, plan } = spouse.json() as {
      sharedMealId: string;
      plan: { finishes: { memberId: string }[] };
    };
    expect(sharedMealId).toBeTruthy();

    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealId}/start`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect((start.json() as { status: string }).status).toBe('cooking');

    const split = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealId}/split`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect((split.json() as { status: string }).status).toBe('split');

    const finishResults = plan.finishes.map((f) => ({ memberId: f.memberId, status: 'applied' }));
    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { finishResults },
    });
    expect((complete.json() as { status: string }).status).toBe('completed');

    const restored = await app.inject({
      method: 'GET',
      url: `/api/v1/common-table/${sharedMealId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const restoredBody = restored.json() as {
      status: string;
      finishStatuses: { status: string }[];
    };
    expect(restoredBody.status).toBe('completed');
    expect(restoredBody.finishStatuses.every((f) => f.status === 'applied')).toBe(true);
  });

  it('records feedback and learns household preferences', async () => {
    const converged = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        memberIds: [ownerMemberId],
        ingredients: ['chicken', 'rice', 'broccoli'],
        ingredientSource: 'text',
      },
    });
    const { sharedMealId, plan } = converged.json() as {
      sharedMealId: string;
      plan: { finishes: { memberId: string }[] };
    };

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/v1/common-table/${sharedMealId}/feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        householdRating: 'loved',
        remember: 'Chicken rice is the family favorite',
        finishResults: plan.finishes.map((f) => ({ memberId: f.memberId, status: 'applied' })),
      },
    });
    expect(feedback.statusCode).toBe(200);
    expect((feedback.json() as { recorded: boolean }).recorded).toBe(true);

    const rows = await HouseholdPreference.findAll({
      where: { memberId: ownerMemberId, ingredient: 'rice' },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0]?.affinity)).toBeGreaterThan(0);
  });

  it('never allows deleting the owner member', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/households/members/${ownerMemberId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);

    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/households/current',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = current.json() as {
      household: { members: { id: string; isOwner: boolean }[] };
    };
    expect(body.household.members.some((m) => m.id === ownerMemberId && m.isOwner)).toBe(true);
  });

  it('removing a member cascades their shared-meal rows and ignores their stale id', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        displayName: 'Sam',
        relationship: 'child',
        ageGroup: 'child',
        constraints: { allergies: ['sesame'] },
      },
    });
    const samId = (created.json() as { member: { id: string } }).member.id;

    const converged = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        memberIds: [ownerMemberId, samId],
        ingredients: ['chicken', 'rice', 'broccoli'],
        ingredientSource: 'text',
      },
    });
    expect(converged.statusCode).toBe(200);
    expect(
      (converged.json() as { memberIds: string[] }).memberIds,
    ).toEqual(expect.arrayContaining([ownerMemberId, samId]));

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/households/members/${samId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(removed.statusCode).toBe(200);
    expect((removed.json() as { removed: boolean }).removed).toBe(true);

    const orphaned = await SharedMealMember.count({ where: { memberId: samId } });
    expect(orphaned).toBe(0);

    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/households/current',
      headers: { authorization: `Bearer ${token}` },
    });
    const members = (current.json() as { household: { members: { id: string }[] } }).household
      .members;
    expect(members.some((m) => m.id === samId)).toBe(false);

    const reconverge = await app.inject({
      method: 'POST',
      url: '/api/v1/common-table/converge',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        memberIds: [ownerMemberId, samId],
        ingredients: ['chicken', 'rice', 'broccoli'],
        ingredientSource: 'text',
      },
    });
    expect(reconverge.statusCode).toBe(200);
    const reconvergedBody = reconverge.json() as { memberIds: string[]; converged: boolean };
    expect(reconvergedBody.memberIds).not.toContain(samId);
    expect(reconvergedBody.converged).toBe(true);
  });

  it('rejects a second delete of an already-removed member', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'One-off', relationship: 'friend' },
    });
    const memberId = (created.json() as { member: { id: string } }).member.id;

    const first = await app.inject({
      method: 'DELETE',
      url: `/api/v1/households/members/${memberId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'DELETE',
      url: `/api/v1/households/members/${memberId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.statusCode).toBe(404);
  });
});
