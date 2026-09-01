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

  it('caps rewarded ads at two distinct transactions per day per user (governance)', async () => {
    const fresh = await registerTestUser(app);
    const headers = { authorization: `Bearer ${fresh.token}` };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/rescue-fuel',
      headers,
      payload: { adTransactionId: `cap-a-${randomUUID()}` },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/rescue-fuel',
      headers,
      payload: { adTransactionId: `cap-b-${randomUUID()}` },
    });
    expect(second.statusCode).toBe(201);

    const third = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `cap-c-${randomUUID()}` },
    });
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe('DAILY_AD_LIMIT');
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

  it('locks reward claims while a pro pass is live (one exclusive hour)', async () => {
    const user = await registerTestUser(app);
    const headers = { authorization: `Bearer ${user.token}` };
    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `lock-1-${randomUUID()}` },
    });

    const stack = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `lock-2-${randomUUID()}` },
    });
    expect(stack.statusCode).toBe(403);
    expect(stack.json().error.code).toBe('ADS_NOT_ELIGIBLE');

    const fuel = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/rescue-fuel',
      headers,
      payload: { adTransactionId: `lock-3-${randomUUID()}` },
    });
    expect(fuel.statusCode).toBe(403);
    expect(fuel.json().error.code).toBe('ADS_NOT_ELIGIBLE');
  });

  it('eligibility flips pro after claim and free again once the hour is over', async () => {
    const user = await registerTestUser(app);
    const headers = { authorization: `Bearer ${user.token}` };

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers,
    });
    expect(before.json()).toMatchObject({ tier: 'free', canWatchProPass: true });

    const claim = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `cycle-1-${randomUUID()}` },
    });
    expect(claim.statusCode).toBe(201);

    const during = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers,
    });
    expect(during.json()).toMatchObject({
      tier: 'pro',
      canWatchRescueFuel: false,
      canWatchProPass: false,
    });

    await User.update(
      { proPassUntil: new Date(Date.now() - 1_000) },
      { where: { id: user.userId } },
    );

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers,
    });
    expect(after.json()).toMatchObject({ tier: 'free', canWatchProPass: true });
  });

  it('lets a user buy another one-hour pass after the previous one expires', async () => {
    const user = await registerTestUser(app);
    const headers = { authorization: `Bearer ${user.token}` };
    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `renew-1-${randomUUID()}` },
    });
    await User.update(
      { proPassUntil: new Date(Date.now() - 1_000) },
      { where: { id: user.userId } },
    );

    const renewal = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/rewards/pro-pass',
      headers,
      payload: { adTransactionId: `renew-2-${randomUUID()}` },
    });
    expect(renewal.statusCode).toBe(201);
    const body = renewal.json();
    expect(body.granted).toBe(true);
    expect(new Date(body.proPassUntil).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);

    const check = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/eligibility',
      headers,
    });
    expect(check.json()).toMatchObject({ tier: 'pro' });
  });
});
