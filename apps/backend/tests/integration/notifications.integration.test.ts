import { buildApp } from '../../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { NotificationLog } from '../../src/database/models/notification-log.model';
import { User } from '../../src/database/models/user.model';
import { sendToUser } from '../../src/services/notifications/notification.service';
import { registerTestUser } from '../helpers/auth';

/**
 * Snooze endpoint + suppression loop (integration) - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('notification snooze route (integration)', () => {
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
    // Registered users default to quiet hours 22..8; pin to "never quiet"
    // so direct sendToUser assertions are time-of-day independent.
    await User.update({ quietStartHour: 0, quietEndHour: 0 }, { where: { id: userId } });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      payload: { kind: 'rescue_window', hours: 24 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid kinds and out-of-range hours', async () => {
    const badKind = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'marketing', hours: 24 },
    });
    expect(badKind.statusCode).toBe(400);

    const zeroHours = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'spoiler_alert', hours: 0 },
    });
    expect(zeroHours.statusCode).toBe(400);

    const tooManyHours = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'spoiler_alert', hours: 73 },
    });
    expect(tooManyHours.statusCode).toBe(400);
  });

  it('snoozes and suppresses subsequent pushes until the deadline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'rescue_window', hours: 24 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(new Date(body.suppressedUntil).getTime()).toBeGreaterThan(Date.now());

    const user = (await User.findByPk(userId))!;
    const outcome = await sendToUser({
      user,
      kind: 'rescue_window',
      title: 'Rescue window',
      body: 'Your leftovers are ready for a comeback.',
    });
    expect(outcome).toBe('snoozed');

    // Suppression short-circuits BEFORE the dedupe mark: the row exists
    // (created by snooze) but nothing was ever "sent".
    const rows = await NotificationLog.findAll({ where: { userId, kind: 'rescue_window' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.suppressedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(new Date(rows[0]!.sentAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('never snoozes longer than requested when an active snooze is shorter', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'spoiler_alert', hours: 2 },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/snooze',
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: 'spoiler_alert', hours: 48 },
    });
    expect(second.statusCode).toBe(200);
    expect(new Date(second.json().suppressedUntil).getTime()).toBeGreaterThan(
      new Date(first.json().suppressedUntil).getTime(),
    );
  });
});
