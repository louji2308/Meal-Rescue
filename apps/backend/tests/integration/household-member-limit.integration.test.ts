import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { User } from '../../src/database/models/user.model';
import { registerTestUser } from '../helpers/auth';

/**
 * Free-tier household roster limit (integration) - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 *
 * Free accounts may add exactly ONE non-owner member; the second add is the
 * server-side backstop for the mobile roster paywall (403 MEMBER_LIMIT_EXCEEDED).
 * Pro accounts are unlimited.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('household member limit (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let userId: string;

  const addMember = (displayName: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName, relationship: 'friend' },
    });

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const reg = await registerTestUser(app);
    token = reg.token;
    userId = reg.userId;

    const hh = await app.inject({
      method: 'POST',
      url: '/api/v1/households',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(hh.statusCode).toBe(200);
    // DB boot + schema sync can exceed the 5s default on loaded machines.
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabase();
  }, 30_000);

  it('allows one added member, blocks the second for free, and unlocks with Pro', async () => {
    const first = await addMember('Alex');
    expect(first.statusCode).toBe(200);

    const second = await addMember('Sam');
    expect(second.statusCode).toBe(403);
    expect(second.json().error.code).toBe('MEMBER_LIMIT_EXCEEDED');
    expect(second.json().error.suggestedAction).toBe('Upgrade to Pro plan');

    await User.update({ subscriptionTier: 'pro' }, { where: { id: userId } });

    const third = await addMember('Sam');
    expect(third.statusCode).toBe(200);
    const ids = [
      (first.json() as { member: { id: string } }).member.id,
      (third.json() as { member: { id: string } }).member.id,
    ];
    expect(new Set(ids).size).toBe(2);
  });
});
