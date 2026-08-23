import { type ScheduledTask, createTask } from 'node-cron';
import { literal } from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

import { initializeDatabase, sequelize } from '../../database';
import type { Db, DbModels } from '../../database/models';
import { Pantry } from '../../database/models/pantry.model';
import { effectiveTier } from '../rescue-allowance.service';
import { writePushCopy } from './copywriter.service';
import { isQuietHours, localDayKey, sendToUser, wasNotified } from './notification.service';

/**
 * Rescue Windows - learned-mealtime nudges.
 *
 * Every 15 minutes we look at free-tier users who have rescued before,
 * figure out the median local hour of their past rescues, and nudge them
 * when "now" enters that hour. The push ledger (once per user/kind/day)
 * plus quiet hours guarantee at most one nudge per day no matter how many
 * ticks land inside the window.
 */

/** Minute-of-day (0..1439) in the user's local timeline for a UTC instant. */
export function localMinuteOfDay(tzOffsetMinutes: number, date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (((utcMinutes - tzOffsetMinutes) % 1440) + 1440) % 1440;
}

/** Hour-of-day (0..23) in the user's local timeline. */
export function localHourOfDay(tzOffsetMinutes: number, date: Date): number {
  return Math.floor(localMinuteOfDay(tzOffsetMinutes, date) / 60);
}

/**
 * Median local hour-of-day across rescue timestamps. Ties/even counts
 * round down so the window stays inside a single clock hour.
 */
export function medianRescueHour(rescueDates: Date[], tzOffsetMinutes: number): number | null {
  if (rescueDates.length === 0) return null;
  const hours = rescueDates.map((d) => localHourOfDay(tzOffsetMinutes, d)).sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  if (hours.length % 2 === 1) return hours[mid]!;
  return Math.floor((hours[mid - 1]! + hours[mid]!) / 2);
}

function mealtimeLabel(hour: number): string {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'a late bite';
}

/**
 * createdAt is omitted from the model's InferAttributes, so it must be
 * selected through a literal; underscored mapping reads the created_at
 * column directly.
 */
async function rescueCreatedAts(models: DbModels, userId: UUID): Promise<Date[]> {
  const rows = await models.Rescue.findAll({
    where: { userId },
    attributes: [[literal('created_at'), 'createdAt']],
    raw: true,
  });
  return rows.map((row) => new Date((row as unknown as { createdAt: string }).createdAt));
}

async function pantryNames(userId: UUID, limit = 3): Promise<string[]> {
  const rows = await Pantry.findAll({
    where: { userId },
    order: [
      ['usePriority', 'DESC'],
      ['addedAt', 'ASC'],
    ],
    limit,
    attributes: ['ingredientName'],
  });
  return rows.map((row) => row.ingredientName);
}

/**
 * One scheduler pass. Returns how many users were actually pushed.
 * `db` is optional so production can call this without wiring; tests pass
 * an explicit db AND an explicit `now` for deterministic hour matching.
 */
export async function runRescueWindowTick(db?: Db, now: Date = new Date()): Promise<number> {
  const resolved: Db = db ?? { sequelize, models: sequelize.models as unknown as DbModels };
  const models = resolved.models;

  const candidates = await models.User.findAll({
    where: { subscriptionTier: 'free' },
  });

  let sent = 0;
  for (const user of candidates) {
    try {
      // Governance: an active ad-granted Pro Pass also silences targeting.
      if (effectiveTier(user) !== 'free') continue;

      const tz = user.tzOffsetMinutes ?? 0;
      const medianHour = medianRescueHour(await rescueCreatedAts(models, user.id), tz);
      if (medianHour === null || localHourOfDay(tz, now) !== medianHour) continue;

      const dayKey = localDayKey(tz, now);
      if (await wasNotified(user.id, 'rescue_window', dayKey)) continue;
      if (isQuietHours(user, now)) continue;

      const foods = await pantryNames(user.id);
      const copy = await writePushCopy({
        kind: 'rescue_window',
        context: {
          foods,
          mealtimeLabel: mealtimeLabel(medianHour),
          mins: 15,
        },
      });

      const outcome = await sendToUser({
        user,
        kind: 'rescue_window',
        title: copy.title,
        body: copy.body,
        deepLink: 'mealrescue://rescue',
      });
      if (outcome === 'sent' || outcome === 'dry_run') sent += 1;
    } catch (err) {
      // One broken user must never kill the timer loop.
      /* eslint-disable no-console */
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'rescue-window tick failed for user',
          userId: user.id,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
      /* eslint-enable no-console */
    }
  }
  return sent;
}

let scheduledTask: ScheduledTask | null = null;
let tickInFlight: Promise<void> | null = null;

async function safeTick(): Promise<void> {
  try {
    const db = await initializeDatabase();
    await runRescueWindowTick(db);
  } catch (err) {
    /* eslint-disable no-console */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'rescue-window tick failed',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    /* eslint-enable no-console */
  }
}

/** Starts the cron job (idempotent). Only called outside test env. */
export function startRescueWindowScheduler(): void {
  if (scheduledTask) return;
  // node-cron v4: createTask does NOT auto-start; start() does.
  const task = createTask('*/15 * * * *', () => {
    tickInFlight = safeTick().finally(() => {
      tickInFlight = null;
    });
  });
  task.start();
  scheduledTask = task;
}

export async function stopRescueWindowScheduler(): Promise<void> {
  if (!scheduledTask) return;
  const task = scheduledTask;
  scheduledTask = null;
  task.stop();
  if (tickInFlight) await tickInFlight.catch(() => undefined);
  await task.destroy();
}
