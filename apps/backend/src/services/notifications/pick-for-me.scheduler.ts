import { type ScheduledTask, createTask } from 'node-cron';
import { Op } from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

import { initializeDatabase, sequelize } from '../../database';
import type { Db, DbModels } from '../../database/models';
import { Pantry } from '../../database/models/pantry.model';
import { effectiveTier } from '../rescue-allowance.service';
import { writePushCopy } from './copywriter.service';
import { isQuietHours, localDayKey, sendToUser, wasNotified } from './notification.service';

/**
 * Pick For Me - daily meal recommendation push.
 *
 * Once per day we find free-tier users with pantry items, look at what
 * they've successfully rescued before, and recommend one dish they can
 * make right now from what they already have. The notification includes
 * "Make it" and "Not tonight" action buttons.
 */

const MAX_USERS_PER_TICK = 50;

/** Simple dish suggestions mapped to common ingredient categories. */
export const DISH_SUGGESTIONS: Record<string, string> = {
  chicken: 'chicken stir-fry',
  broccoli: 'garlic broccoli pasta',
  rice: 'fried rice',
  eggs: 'vegetable omelette',
  pasta: 'pasta primavera',
  tomato: 'tomato bruschetta',
  onion: 'caramelized onion soup',
  cheese: 'grilled cheese sandwich',
  bread: 'garlic bread with herbs',
  beef: 'beef stir-fry',
  salmon: 'pan-seared salmon',
  tofu: 'crispy tofu bowl',
  potato: 'roasted potato medley',
  carrot: 'honey-glazed carrots',
  spinach: 'garlic spinach saute',
  mushroom: 'mushroom risotto',
  pepper: 'stuffed peppers',
  beans: 'three-bean chili',
  yogurt: 'yogurt parfait',
  lemon: 'lemon herb chicken',
};

/** Try to pick a dish that matches pantry items + user's taste. */
export async function pickDishForUser(
  models: DbModels,
  userId: UUID,
  pantryItems: string[],
): Promise<{ dish: string; ingredients: string[]; mins: number } | null> {
  // Look at past accepted rescues for dish ideas
  const pastRescues = await models.Rescue.findAll({
    where: {
      userId,
      userDecision: { [Op.in]: ['accepted', 'kept_as_is'] },
    },
    attributes: ['selectedRecommendation'],
    order: [['created_at', 'DESC']],
    limit: 10,
    raw: true,
  });

  // Extract dish names from past rescues
  const pastDishes: string[] = [];
  for (const rescue of pastRescues) {
    const rec = rescue.selectedRecommendation as Record<string, unknown>;
    if (rec && typeof rec === 'object') {
      const name = rec.name ?? rec.dishName ?? rec.title;
      if (typeof name === 'string' && name.trim()) {
        pastDishes.push(name.trim());
      }
    }
  }

  // If we have past dishes, pick one that uses available ingredients
  if (pastDishes.length > 0 && pantryItems.length > 0) {
    for (const dish of pastDishes) {
      const dishLower = dish.toLowerCase();
      // Check if any pantry item is mentioned in the dish name
      if (pantryItems.some((item) => dishLower.includes(item.toLowerCase()))) {
        return { dish, ingredients: pantryItems.slice(0, 3), mins: 20 };
      }
    }
    // If no direct match, pick the most recent accepted dish
    return { dish: pastDishes[0]!, ingredients: pantryItems.slice(0, 3), mins: 20 };
  }

  // Fallback: match pantry items to our suggestion map
  for (const item of pantryItems) {
    const suggestion = DISH_SUGGESTIONS[item.toLowerCase()];
    if (suggestion) {
      return { dish: suggestion, ingredients: pantryItems.slice(0, 3), mins: 15 };
    }
  }

  // Last resort: generic suggestion based on first pantry item
  if (pantryItems.length > 0) {
    return {
      dish: `${pantryItems[0]} bowl`,
      ingredients: pantryItems.slice(0, 3),
      mins: 20,
    };
  }

  return null;
}

/**
 * One scheduler pass. Returns how many users were actually pushed.
 */
export async function runPickForMeTick(db?: Db, now: Date = new Date()): Promise<number> {
  const resolved: Db = db ?? { sequelize, models: sequelize.models as unknown as DbModels };
  const models = resolved.models;

  const candidates = await models.User.findAll({
    where: { subscriptionTier: 'free' },
  });

  let sent = 0;
  for (const user of candidates.slice(0, MAX_USERS_PER_TICK)) {
    try {
      if (effectiveTier(user) !== 'free') continue;

      const tz = user.tzOffsetMinutes ?? 0;
      const dayKey = localDayKey(tz, now);
      if (await wasNotified(user.id, 'pick_for_me', dayKey)) continue;
      if (isQuietHours(user, now)) continue;

      // Get user's pantry items
      const pantryRows = await Pantry.findAll({
        where: { userId: user.id },
        order: [
          ['usePriority', 'DESC'],
          ['addedAt', 'ASC'],
        ],
        limit: 5,
        attributes: ['ingredientName'],
      });
      const pantryItems = pantryRows.map((r) => r.ingredientName);
      if (pantryItems.length === 0) continue;

      const pick = await pickDishForUser(models, user.id, pantryItems);
      if (!pick) continue;

      const copy = await writePushCopy({
        kind: 'pick_for_me',
        context: {
          dish: pick.dish,
          foods: pick.ingredients,
          mins: pick.mins,
        },
      });

      const outcome = await sendToUser({
        user,
        kind: 'pick_for_me',
        title: copy.title,
        body: copy.body,
        deepLink: `mealrescue://rescue?dish=${encodeURIComponent(pick.dish)}`,
        buttons: [
          { id: 'make_it', text: 'Make it' },
          { id: 'not_tonight', text: 'Not tonight' },
        ],
      });
      if (outcome === 'sent' || outcome === 'dry_run') sent += 1;
    } catch (err) {
      /* eslint-disable no-console */
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'pick-for-me tick failed for user',
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
    await runPickForMeTick(db);
  } catch (err) {
    /* eslint-disable no-console */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'pick-for-me tick failed',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    /* eslint-enable no-console */
  }
}

/**
 * Starts the daily cron job (idempotent). Runs at 17:00 UTC - adjust
 * for your users' timezone distribution in production.
 */
export function startPickForMeScheduler(): void {
  if (scheduledTask) return;
  const task = createTask('0 17 * * *', () => {
    tickInFlight = safeTick().finally(() => {
      tickInFlight = null;
    });
  });
  task.start();
  scheduledTask = task;
}

export async function stopPickForMeScheduler(): Promise<void> {
  if (!scheduledTask) return;
  const task = scheduledTask;
  scheduledTask = null;
  task.stop();
  if (tickInFlight) await tickInFlight.catch(() => undefined);
  await task.destroy();
}
