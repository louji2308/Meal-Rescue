import { type ScheduledTask, createTask } from 'node-cron';
import { Op } from 'sequelize';

import { initializeDatabase, sequelize } from '../../database';
import type { Db, DbModels } from '../../database/models';

/**
 * Meal Memory daily maintenance.
 *
 * Runs once a day and expires InventoryReservation rows whose expiry passed,
 * so "save the chicken for Sunday" stops being a HOLD on Monday morning.
 * Idempotent, thin, and safe to run any time of day (downtime only costs a
 * stale hold for a few hours).
 */

export async function runMealMemoryTick(db?: Db, now: Date = new Date()): Promise<number> {
  const resolved: Db = db ?? {
    sequelize,
    models: sequelize.models as unknown as DbModels,
  };
  const models = resolved.models;

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  const [affected] = await models.InventoryReservation.update(
    { active: false },
    { where: { active: true, expiresAt: { [Op.lt]: todayKey } } },
  );
  return affected;
}

let scheduledTask: ScheduledTask | null = null;
let tickInFlight: Promise<void> | null = null;

async function safeTick(): Promise<void> {
  try {
    const db = await initializeDatabase();
    await runMealMemoryTick(db);
  } catch (err) {
    /* eslint-disable no-console */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'meal-memory tick failed',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    /* eslint-enable no-console */
  }
}

/** Daily at 04:00 UTC. Idempotent; only started outside test env. */
export function startMealMemoryScheduler(): void {
  if (scheduledTask) return;
  const task = createTask('0 4 * * *', () => {
    tickInFlight = safeTick().finally(() => {
      tickInFlight = null;
    });
  });
  task.start();
  scheduledTask = task;
}

export async function stopMealMemoryScheduler(): Promise<void> {
  if (!scheduledTask) return;
  const task = scheduledTask;
  scheduledTask = null;
  task.stop();
  if (tickInFlight) await tickInFlight.catch(() => undefined);
  await task.destroy();
}
