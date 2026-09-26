import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { AiPlannerResponse } from '@meal-rescue/shared-types';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('AI planner routes (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;

    // Create a household so the service can resolve a household id.
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

  it('POST /ai-plan starts a session and answers with the expected contract', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/ai-plan',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: 'plan me for tomorrow' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as AiPlannerResponse & { sessionId: string };

    expect(typeof body.sessionId).toBe('string');
    expect(['ready', 'clarification']).toContain(body.status);
    expect(typeof body.message).toBe('string');
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.preview === null || typeof body.preview === 'object').toBe(true);

    if (body.status === 'clarification') {
      expect(body.questions.length).toBeGreaterThan(0);
      expect(body.questions[0]).toHaveProperty('question');
      expect(body.preview).toBeNull();
    }

    if (body.status === 'ready') {
      expect(body.preview).not.toBeNull();
      expect(body.preview!.previewId).toBeTruthy();
      expect(Array.isArray(body.preview!.days)).toBe(true);
    }

    // A session token round-trips: answering continues the same session.
    const reply = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/ai-plan',
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: body.sessionId, text: 'keep it light' },
    });
    expect(reply.statusCode).toBe(200);
    const replyBody = reply.json() as AiPlannerResponse & { sessionId: string };
    expect(replyBody.sessionId).toBe(body.sessionId);
  });

  it('POST /ai-plan rejects empty text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/ai-plan',
      headers: { authorization: `Bearer ${token}` },
      payload: { text: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /ai-plan rejects a foreign/unknown session id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/ai-plan',
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: 'does-not-exist', text: 'keep it light' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /ai-plan requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal-memory/ai-plan',
      payload: { text: 'plan me' },
    });
    expect(res.statusCode).toBe(401);
  });
});
