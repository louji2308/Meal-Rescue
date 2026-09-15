import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('meal intelligence routes (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;

    // Create a household so worldState queries don't 404.
    await app.inject({
      method: 'POST',
      url: '/api/v1/households',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('GET /suggestions returns 200 with valid structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meal-memory/suggestions?weekStart=2026-09-07',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      weekStart: string;
      mealSlot: string | null;
      basedOn: { openSlots: number; expiringItems: number; leftovers: number };
      suggestions: unknown[];
    };
    expect(body.weekStart).toBe('2026-09-07');
    expect(body.mealSlot).toBeNull();
    expect(body.basedOn).toHaveProperty('openSlots');
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it('GET /suggestions rejects invalid weekStart format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meal-memory/suggestions?weekStart=not-a-date',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /use-what-you-have returns 200 with valid structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meal-memory/use-what-you-have',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      basedOn: { inventoryCount: number; expiringCount: number; leftoverCount: number };
      ideas: unknown[];
    };
    expect(body.basedOn).toHaveProperty('inventoryCount');
    expect(Array.isArray(body.ideas)).toBe(true);
  });

  it('GET /summary returns 200 with valid structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meal-memory/summary?weekStart=2026-09-07',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      weekStart: string;
      headline: string;
      planning: { planned: number; confirmed: number; eaten: number; openSlots: number; blockedSlots: number; coveragePercent: number };
      expiringSoon: unknown[];
      leftovers: unknown[];
      purchaseNeeds: unknown[];
      insights: unknown[];
      highlight: { concept: string; message: string } | null;
      engagement: { recordedMeals: number; plannedMeals: number; recordRatio: number };
    };
    expect(body.weekStart).toBe('2026-09-07');
    expect(typeof body.headline).toBe('string');
    expect(typeof body.planning.planned).toBe('number');
    expect(typeof body.planning.openSlots).toBe('number');
    expect(Array.isArray(body.insights)).toBe(true);
    expect(typeof body.engagement.recordedMeals).toBe('number');
  });

  it('GET /summary rejects invalid weekStart format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meal-memory/summary?weekStart=bad',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('all three endpoints require auth', async () => {
    const suggestions = await app.inject({ method: 'GET', url: '/api/v1/meal-memory/suggestions' });
    const useWhatYouHave = await app.inject({ method: 'GET', url: '/api/v1/meal-memory/use-what-you-have' });
    const summary = await app.inject({ method: 'GET', url: '/api/v1/meal-memory/summary' });
    expect(suggestions.statusCode).toBe(401);
    expect(useWhatYouHave.statusCode).toBe(401);
    expect(summary.statusCode).toBe(401);
  });
});