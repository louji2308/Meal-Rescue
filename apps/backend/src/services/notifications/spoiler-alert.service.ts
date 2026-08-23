import { type ScheduledTask, createTask } from 'node-cron';
import { Op } from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

import { sequelize } from '../../database';
import type { Db, DbModels } from '../../database/models';
import { Pantry } from '../../database/models/pantry.model';
import { User } from '../../database/models/user.model';
import { writePushCopy } from './copywriter.service';
import { isQuietHours, localDayKey, sendToUser, wasNotified } from './notification.service';

/**
 * Spoiler Alert - expiry-driven nudges.
 *
 * Scans pantry rows whose `expiresAt` lands within the next 48 hours and
 * that have gone untouched for a week (or were never used after being
 * added more than a week ago). One notification per user per day max,
 * naming the ingredient that will spoil first.
 */

const EXPIRY_WINDOW_MS = 48 * 3_600_000;
const STALE_AFTER_MS = 7 * 24 * 3_600_000;
const MAX_USERS_PER_TICK = 50;

export interface ExpiringItem {
  id: UUID;
  userId: UUID;
  ingredientName: string;
}

/** Shared selection predicate so the tick query stays in one place. */
export async function findSpoilerCandidates(
  models: Pick<DbModels, 'Pantry'>,
  now: Date = new Date(),
): Promise<ExpiringItem[]> {
  const weekAgo = new Date(now.getTime() - STALE_AFTER_MS);
  const rows = await models.Pantry.findAll({
    where: {
      expiresAt: { [Op.ne]: null, [Op.between]: [now, new Date(now.getTime() + EXPIRY_WINDOW_MS)] },
      [Op.or]: [
        { lastUsedAt: { [Op.ne]: null, [Op.lt]: weekAgo } },
        { lastUsedAt: null, addedAt: { [Op.lt]: weekAgo } },
      ],
    },
    order: [['expiresAt', 'ASC']],
    attributes: ['id', 'userId', 'ingredientName'],
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    ingredientName: row.ingredientName,
  }));
}

/**
 * One scheduler pass. Returns how many users were actually pushed.
 * Deterministic via the injected `now` in tests; the ledger makes repeat
 * ticks on the same local day a no-op.
 */
export async function runSpoilerAlertTick(db?: Db, now: Date = new Date()): Promise<number> {
  const resolved: Db = db ?? { sequelize, models: sequelize.models as unknown as DbModels };
  const models: Pick<DbModels, 'Pantry' | 'User'> = {
    Pantry: resolved.models.Pantry ?? Pantry,
    User: resolved.models.User ?? User,
  };

  const candidates = await findSpoilerCandidates(models, now);
  // Group per user keeping each user's soonest-expiring item first.
  const byUser = new Map<UUID, string[]>();
  for (const item of candidates) {
    const names = byUser.get(item.userId) ?? [];
    if (!names.includes(item.ingredientName)) names.push(item.ingredientName);
    byUser.set(item.userId, names);
  }

  let sent = 0;
  for (const [userId, ingredients] of [...byUser.entries()].slice(0, MAX_USERS_PER_TICK)) {
    try {
      const user = await models.User.findByPk(userId);
      if (!user || user.subscriptionTier !== 'free') continue;

      const tz = user.tzOffsetMinutes ?? 0;
      const dayKey = localDayKey(tz, now);
      if (await wasNotified(user.id, 'spoiler_alert', dayKey)) continue;
      if (isQuietHours(user, now)) continue;

      const item = ingredients[0]!;
      const copy = await writePushCopy({
        kind: 'spoiler_alert',
        context: { item, foods: ingredients.slice(0, 3), mins: 20 },
      });

      const outcome = await sendToUser({
        user,
        kind: 'spoiler_alert',
        title: copy.title,
        body: copy.body,
        deepLink: 'mealrescue://pantry',
      });
      if (outcome === 'sent' || outcome === 'dry_run') sent += 1;
    } catch (err) {
      /* eslint-disable no-console */
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'spoiler-alert tick failed for user',
          userId,
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
    await runSpoilerAlertTick();
  } catch (err) {
    /* eslint-disable no-console */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'spoiler-alert tick failed',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    /* eslint-enable no-console */
  }
}

/** Starts the hourly cron job (idempotent). Only called outside test env. */
export function startSpoilerAlertScheduler(): void {
  if (scheduledTask) return;
  // Off the quarter-hour marks so the two jobs never collide.
  const task = createTask('15 * * * *', () => {
    tickInFlight = safeTick().finally(() => {
      tickInFlight = null;
    });
  });
  task.start();
  scheduledTask = task;
}

export async function stopSpoilerAlertScheduler(): Promise<void> {
  if (!scheduledTask) return;
  const task = scheduledTask;
  scheduledTask = null;
  task.stop();
  if (tickInFlight) await tickInFlight.catch(() => undefined);
  await task.destroy();
}
