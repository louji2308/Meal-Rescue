import { randomUUID } from 'node:crypto';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { User } from '../../src/database/models/user.model';

/**
 * RevenueCat lifecycle webhook integration test - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided:
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
const hasDb =
  Boolean(process.env.TEST_DATABASE_URL) && Boolean(process.env.REVENUECAT_WEBHOOK_SECRET);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('revenuecat webhook (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET as string;
  const auth = { authorization: `Bearer ${secret}` };

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  async function seedUser(tier: 'free' | 'pro' = 'free'): Promise<User> {
    return User.create({
      id: randomUUID(),
      email: `rc-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: tier,
      locale: 'en-US',
    });
  }

  function event(type: string, appUserId: string): object {
    return {
      api_version: '1.0',
      event: { type, app_user_id: appUserId, product_id: 'pro_monthly' },
    };
  }

  it('rejects requests with a wrong bearer secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: { authorization: 'Bearer wrong-secret' },
      payload: event('INITIAL_PURCHASE', randomUUID()),
    });
    expect(res.statusCode).toBe(401);
  });

  it('flips tier to pro on INITIAL_PURCHASE', async () => {
    const user = await seedUser('free');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: auth,
      payload: event('INITIAL_PURCHASE', user.id),
    });
    expect(res.statusCode).toBe(200);
    const after = await User.findByPk(user.id);
    expect(after?.subscriptionTier).toBe('pro');
  });

  it('keeps pro on RENEWAL and reverts to free on EXPIRATION', async () => {
    const user = await seedUser('free');
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: auth,
      payload: event('RENEWAL', user.id),
    });
    expect((await User.findByPk(user.id))?.subscriptionTier).toBe('pro');

    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: auth,
      payload: event('EXPIRATION', user.id),
    });
    expect((await User.findByPk(user.id))?.subscriptionTier).toBe('free');
  });

  it('ignores non-lifecycle events without touching the tier', async () => {
    const user = await seedUser('free');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: auth,
      payload: event('TEST', user.id),
    });
    expect(res.statusCode).toBe(200);
    expect((await User.findByPk(user.id))?.subscriptionTier).toBe('free');
  });

  it('acks malformed payloads with 200 so RevenueCat stops retrying', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      headers: auth,
      payload: { unexpected: 'shape' },
    });
    expect(res.statusCode).toBe(200);
  });
});
