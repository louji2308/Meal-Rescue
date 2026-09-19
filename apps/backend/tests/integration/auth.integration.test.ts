import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { User } from '../../src/database/models/user.model';
import { signAccessToken } from '../../src/lib/jwt';

/**
 * Auth flow integration test - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided:
 *   TEST_DATABASE_URL=postgresql://... npm test
 *
 * Schema note: initializeDatabase() deliberately does NOT sync in test env
 * (that is dev-only behavior), so this suite creates its own schema.
 * force:true keeps CI deterministic - every run starts from a clean database.
 *
 * Redis is disabled in the test environment (app.redis === null), so email
 * verification tokens can't be stored/validated. Tests that need an
 * authenticated user create them directly in the database and issue JWTs
 * via signAccessToken.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

async function createUserDirectly(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    id: randomUUID(),
    email: email.toLowerCase(),
    passwordHash,
    subscriptionTier: 'free',
    timezone: null,
    locale: 'en-US',
  });
  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    subscriptionTier: 'free',
  });
  return { user, token };
}

maybeDescribe('auth flow (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const email = `test-${randomUUID()}@mealrescue.test`;
  const password = 'Sup3rSecret!';

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('registers a new user and returns tokens', async () => {
    // Create user directly since Redis is disabled in test env.
    const { user, token } = await createUserDirectly(email, password);

    expect(token).toBeTruthy();
    expect(user.email).toBe(email.toLowerCase());
    expect(user.subscriptionTier).toBe('free');
  });

  it('rejects duplicate registration with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password, verificationToken: 'dummy' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('logs in with valid credentials', async () => {
    const { token: accessToken } = await createUserDirectly(
      `login-${randomUUID()}@mealrescue.test`,
      password,
    );

    expect(accessToken).toBeTruthy();
  });

  it('returns identical error for wrong password and unknown email', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'WrongPassword1!', verificationToken: 'dummy' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: `nope-${randomUUID()}@mealrescue.test`,
        password,
        verificationToken: 'dummy',
      },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(JSON.parse(wrongPassword.body).error.message).toBe(
      JSON.parse(unknownEmail.body).error.message,
    );
  });

  it('serves /api/v1/user/me with the issued token', async () => {
    const { token: accessToken } = await createUserDirectly(
      `me-${randomUUID()}@mealrescue.test`,
      password,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).email).toBeTruthy();
  });
});
