import { randomUUID } from 'node:crypto';

import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import type { Db } from '../../src/database/models';
import { Meal } from '../../src/database/models/meal.model';
import { NotificationLog } from '../../src/database/models/notification-log.model';
import { Rescue } from '../../src/database/models/rescue.model';
import { User } from '../../src/database/models/user.model';
import { localDayKey } from '../../src/services/notifications/notification.service';
import { runRescueWindowTick } from '../../src/services/notifications/rescue-window.scheduler';

/**
 * Rescue Windows scheduler (integration) - requires PostgreSQL.
 * Skipped automatically unless TEST_DATABASE_URL is provided.
 *
 * Determinism strategy: the tick receives an explicit `now` anchored to
 * :30 of the current clock hour, and seeded rescues sit 10/20 minutes
 * earlier - same local hour, so the median-hour gate matches regardless
 * of when the suite runs. Quiet hours are explicitly disabled per user.
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

/** Current clock hour, pinned to :30 so +-20min stays inside the hour. */
function hourAnchor(): Date {
  const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return new Date(hourStart + 30 * 60_000);
}

maybeDescribe('rescue window scheduler (integration)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await initializeDatabase();
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

  async function seedRescuesAt(user: User, times: Date[]): Promise<void> {
    const meal = await Meal.create({
      id: randomUUID(),
      userId: user.id,
      originalInput: 'sad leftovers',
      inputType: 'text',
      detectedFoods: [{ name: 'fried rice', confidence: 0.9 }],
      detectedIngredients: [{ name: 'rice', confidence: 0.9, state: 'cooked' }],
      detectedComponents: { protein: false },
    });
    for (const time of times) {
      const rescue = await Rescue.create({
        id: randomUUID(),
        mealId: meal.id,
        userId: user.id,
        originalMeal: {},
        detectedIngredients: [],
        constraints: {},
        candidatesGenerated: [],
        selectedRecommendation: {},
        reasoning: 'seed',
        userDecision: 'pending',
      });
      // createdAt is omitted from creation attrs; backdate via raw SQL.
      await sequelize.query('UPDATE rescues SET created_at = $t WHERE id = $id', {
        bind: { t: time.toISOString(), id: rescue.id },
      });
    }
  }

  it('pushes eligible users once and ledger-marks them', async () => {
    const now = hourAnchor();
    const user = await seedUser('win');
    await seedRescuesAt(user, [
      new Date(now.getTime() - 10 * 60_000),
      new Date(now.getTime() - 20 * 60_000),
    ]);

    const sent = await runRescueWindowTick(db, now);
    expect(sent).toBe(1);

    const logs = await NotificationLog.findAll({
      where: { userId: user.id, kind: 'rescue_window' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.dayKey).toBe(localDayKey(0, now));
  }, 30_000);

  it('is a no-op on the second tick of the same day', async () => {
    const now = hourAnchor();
    const sentAgain = await runRescueWindowTick(db, now);
    expect(sentAgain).toBe(0);
  }, 30_000);

  it('never selects users without rescue history', async () => {
    const now = hourAnchor();
    const freshUser = await seedUser('coldstart');
    await runRescueWindowTick(db, now);
    const logs = await NotificationLog.findAll({ where: { userId: freshUser.id } });
    expect(logs).toHaveLength(0);
  }, 30_000);

  it('skips users whose median hour does not match the current hour', async () => {
    const now = hourAnchor();
    const offPeak = await seedUser('offpeak');
    // Rescues two hours ahead of the anchor -> different median hour.
    await seedRescuesAt(offPeak, [
      new Date(now.getTime() + 120 * 60_000),
      new Date(now.getTime() + 110 * 60_000),
    ]);

    await runRescueWindowTick(db, now);
    const logs = await NotificationLog.findAll({ where: { userId: offPeak.id } });
    expect(logs).toHaveLength(0);
  }, 30_000);

  it('skips users with an active Pro Pass even when eligible otherwise', async () => {
    const now = hourAnchor();
    const passUser = await seedUser('propass');
    await seedRescuesAt(passUser, [new Date(now.getTime() - 10 * 60_000)]);
    await passUser.update({ proPassUntil: new Date(Date.now() + 3_600_000) });

    await runRescueWindowTick(db, now);
    const logs = await NotificationLog.findAll({ where: { userId: passUser.id } });
    expect(logs).toHaveLength(0);
  }, 30_000);
});
