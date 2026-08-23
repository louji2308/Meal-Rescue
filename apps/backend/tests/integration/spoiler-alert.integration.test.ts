import { randomUUID } from 'node:crypto';

import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { NotificationLog } from '../../src/database/models/notification-log.model';
import { Pantry } from '../../src/database/models/pantry.model';
import { User } from '../../src/database/models/user.model';
import { runSpoilerAlertTick } from '../../src/services/notifications/spoiler-alert.service';

/**
 * Spoiler Alert scheduler (integration) - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

const DAY_MS = 24 * 3_600_000;

maybeDescribe('spoiler alert scheduler (integration)', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedUser(emailPrefix: string): Promise<User> {
    return User.create({
      id: randomUUID(),
      email: `${emailPrefix}-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: 'free',
      locale: 'en-US',
      tzOffsetMinutes: 0,
      quietStartHour: 0, // equal start/end = never quiet (deterministic)
      quietEndHour: 0,
    });
  }

  async function seedPantry(
    userId: string,
    overrides: Partial<{
      ingredientName: string;
      addedAt: Date;
      expiresAt: Date | null;
      lastUsedAt: Date | null;
    }> = {},
  ): Promise<void> {
    const now = new Date();
    await Pantry.create({
      id: randomUUID(),
      userId,
      ingredientName: overrides.ingredientName ?? 'spinach',
      quantity: 200,
      unit: 'g',
      addedAt: overrides.addedAt ?? new Date(now.getTime() - 10 * DAY_MS),
      expiresAt: overrides.expiresAt ?? new Date(now.getTime() + DAY_MS),
      lastUsedAt: overrides.lastUsedAt ?? null,
      usePriority: 0,
    });
  }

  it('notifies the user whose expiring item went stale', async () => {
    const user = await seedUser('spoiled');
    await seedPantry(user.id); // expires in 24h, added 10d ago, never used

    const sent = await runSpoilerAlertTick();
    expect(sent).toBeGreaterThanOrEqual(1);

    const logs = await NotificationLog.findAll({
      where: { userId: user.id, kind: 'spoiler_alert' },
    });
    expect(logs).toHaveLength(1);
  }, 30_000);

  it('ignores items that were used recently', async () => {
    const freshUser = await seedUser('fresh');
    await seedPantry(freshUser.id, {
      ingredientName: 'yogurt',
      lastUsedAt: new Date(Date.now() - DAY_MS),
    });

    await runSpoilerAlertTick();
    const logs = await NotificationLog.findAll({ where: { userId: freshUser.id } });
    expect(logs).toHaveLength(0);
  }, 30_000);

  it('is a no-op when nothing expires inside the window', async () => {
    const before = await NotificationLog.count({ where: { kind: 'spoiler_alert' } });
    const lonelyUser = await seedUser('lonely');
    await seedPantry(lonelyUser.id, {
      ingredientName: 'frozen peas',
      expiresAt: new Date(Date.now() + 10 * DAY_MS), // outside 48h window
    });

    const sent = await runSpoilerAlertTick();
    expect(sent).toBe(0);
    const after = await NotificationLog.count({ where: { kind: 'spoiler_alert' } });
    expect(after).toBe(before);
  }, 30_000);

  it('sends at most one spoiler per user per day', async () => {
    const user = await seedUser('capped');
    await seedPantry(user.id, { ingredientName: 'spinach' });
    await seedPantry(user.id, {
      ingredientName: 'mushrooms',
      expiresAt: new Date(Date.now() + 12 * 3_600_000),
    });

    const firstCount = await runSpoilerAlertTick();
    expect(firstCount).toBeGreaterThanOrEqual(1);
    const rowsAfterFirst = await NotificationLog.findAll({ where: { kind: 'spoiler_alert' } });
    const countForUser = rowsAfterFirst.filter((row) => row.userId === user.id).length;
    expect(countForUser).toBe(1);

    await runSpoilerAlertTick();
    const rowsAfterSecond = await NotificationLog.findAll({ where: { kind: 'spoiler_alert' } });
    expect(rowsAfterSecond.filter((row) => row.userId === user.id)).toHaveLength(1);
  }, 30_000);
});
