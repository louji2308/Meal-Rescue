import { randomUUID } from 'node:crypto';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { User } from '../../src/database/models/user.model';
import { registerTestUser } from '../helpers/auth';

/**
 * Ads reward claims (integration) - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('ads reward routes (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const reg = await registerTestUser(app);
    token = reg.token;
    userId = reg.userId;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('reports eligibility for a fresh free user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      tier: 'free',
      rescuesToday: 0,
      rescueCredits: 0,
      canWatchRescueFuel: true,
      canWatchProPass: true,
    });
  });

  it('marks pro subscribers as never ad-eligible (governance)', async () => {
    await User.update({ subscriptionTier: 'pro' }, { where: { id: userId } });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()).toMatchObject({
      tier: 'pro',
      canWatchRescueFuel: false,
      canWatchProPass: false,
    });
    await User.update({ subscriptionTier: 'free' }, { where: { id: userId } });
  });

  it('grants Rescue Fuel credits exactly once per ad transaction', async () => {
    const txId = `admobsim-${randomUUID()}`;
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/rescue-fuel',
      headers: { authorization: `Bearer ${token}` },
      payload: { adTransactionId: txId },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ granted: true, rescueCredits: 2 });

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/rescue-fuel',
      headers: { authorization: `Bearer ${token}` },
      payload: { adTransactionId: txId },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ granted: false });
  });

  it('rejects claims without an ad transaction id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('grants and expires Pro Pass windows', async () => {
    const txId = `admobsim-${randomUUID()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers: { authorization: `Bearer ${token}` },
      payload: { adTransactionId: txId },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.granted).toBe(true);
    expect(new Date(body.proPassUntil).getTime()).toBeGreaterThan(Date.now());
  });
});
