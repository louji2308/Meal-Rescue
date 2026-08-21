import { randomUUID } from 'node:crypto';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase } from '../../src/database';

/**
 * Auth flow integration test - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided:
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('auth flow (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const email = `test-${randomUUID()}@mealrescue.test`;
  const password = 'Sup3rSecret!';

  beforeAll(async () => {
    await initializeDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('registers a new user and returns tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTruthy();
    expect(body.user.email).toBe(email.toLowerCase());
    expect(body.user.subscriptionTier).toBe('free');
  });

  it('rejects duplicate registration with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('logs in with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeTruthy();
  });

  it('returns identical error for wrong password and unknown email', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'WrongPassword1' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `nope-${randomUUID()}@mealrescue.test`, password },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(JSON.parse(wrongPassword.body).error.message).toBe(
      JSON.parse(unknownEmail.body).error.message,
    );
  });

  it('serves /api/v1/user/me with the issued token', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    const { accessToken } = JSON.parse(login.body);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).email).toBe(email.toLowerCase());
  });
});
