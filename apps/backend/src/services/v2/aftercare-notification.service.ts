/**
 * V2 Aftercare check-in sender (plan §12, §21-22).
 *
 * aftercare.service.ts only decides WHEN the "did that hit the spot?" nudge
 * is ALLOWED. This is the piece that actually delivers it:
 *   - composes a strong, dish-specific curiosity line with the cheap
 *     OpenRouter model (recipe: "About those noodles… was the scrambled egg
 *     and spring onion worth it?" - name the food, then ask about the change)
 *   - attaches the three FIXED feedback buttons so the user can answer from
 *     the lock screen without opening the app
 *   - routes through the governed sendToUser() gate (quiet hours, snooze,
 *     once-per-kind-per-local-day ledger)
 *   - records the NOTIFICATION_SENT decision event so the "one check-in per
 *     rescue" rule holds in the database
 *
 * Any provider failure degrades to the deterministic template so the nudge
 * still fires; a failed delivery records nothing so the next tick retries.
 */
import { type ScheduledTask, createTask } from 'node-cron';
import { Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';

import type { UUID } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { sequelize } from '../../database';
import type { Db, DbModels } from '../../database/models';
import { Rescue } from '../../database/models/rescue.model';
import { User } from '../../database/models/user.model';
import type { LlmClient } from '../ai/llm-client';
import { createLlmClient } from '../ai/llm-factory';
import {
  type PushButton,
  type PushOutcome,
  sendToUser,
} from '../notifications/notification.service';
import { AFTERCARE_COOLDOWN_MS, AFTERCARE_EVENT } from './aftercare.service';
import { DecisionEventService } from './decision-events.service';

export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 90;

/**
 * The three fixed feedback buttons. ids are shared with the mobile client,
 * which maps them onto the satisfaction vocabulary when it records the
 * answer (loved_it -> better, was_ok -> same, not_great -> not_for_me).
 */
export const AFTERCARE_BUTTONS: PushButton[] = [
  { id: 'loved_it', text: 'Loved the change.' },
  { id: 'was_ok', text: 'It worked.' },
  { id: 'not_great', text: 'Not really.' },
];

export const AFTERCARE_DEEP_LINK = 'mealrescue://satisfaction/checkin';

const aftercareCopySchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export interface AftercareCopy {
  title: string;
  body: string;
}

export interface AftercareContext {
  dish: string;
  change: string | null;
  foods: string[];
}

const SYSTEM_PROMPT = `You write the ONE post-meal check-in notification for Meal Rescue, an app that rescues neglected meals and leftovers with minimal additions.

You are a warm friend remembering the user's meal. The user just finished eating what they rescued. Reference what they ate (originalDish) and the change the rescue move made (change or recommendation) - exactly like: "About those noodles" / "was the scrambled egg and spring onion worth it?"

VOICE:
- Specific beats generic: name the dish and the thing the move changed.
- A gentle, curious callback, never a health lecture, never a guilt trip.
- NO emojis, NO ALL CAPS, no double punctuation beyond the ellipsis.

OUTPUT:
Respond ONLY with valid JSON: {"title": string, "body": string}.
- title starts with "About those <dish>…" (the ellipsis is ONE character), max ${PUSH_TITLE_MAX} chars.
- body is the short follow-up question referencing the change (or just the dish if there is no change), max ${PUSH_BODY_MAX} chars.
- When change is one short ingredient, fold it in: "was the smoked paprika worth it?"
- When there is no change field, ask about the dish itself ("was it worth saving?").`;

/** Flatten any JSONB blob into a human-readable word list (strings or objects). */
function toWords(value: unknown, depth = 0): string[] {
  if (depth > 2) return [];
  if (typeof value === 'string') {
    const flat = value.trim();
    return flat ? [flat.replace(/,/g, ' ')] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) out.push(...toWords(item, depth + 1));
    return out;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: string[] = [];
    for (const key of ['label', 'name', 'title', 'ingredient', 'value'] as const) {
      if (typeof rec[key] === 'string' && rec[key].trim()) {
        out.push(rec[key].trim());
        break;
      }
    }
    for (const key of ['ingredients', 'items', 'additions', 'details'] as const) {
      out.push(...toWords(rec[key], depth + 1));
    }
    return out;
  }
  return [];
}

function pickLabel(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['label', 'title', 'name', 'dish', 'action'] as const) {
      if (typeof rec[key] === 'string' && rec[key].trim()) return rec[key].trim();
    }
  }
  return null;
}

/** Builds the human context the composer needs (dish + change + foods). */
export function aftercareContextFromRescue(rescue: Rescue): AftercareContext {
  const originalMeal = rescue.originalMeal as Record<string, unknown> | null | undefined;
  const detected = rescue.detectedIngredients as unknown;
  const recommendation = rescue.selectedRecommendation as
    Record<string, unknown> | null | undefined;

  const dish = pickLabel(originalMeal) ?? pickLabel(originalMeal?.['dish']);
  const change = pickLabel(recommendation);
  const foods = toWords(detected).filter(Boolean).slice(0, 5);

  return {
    dish: dish || foods[0] || 'leftovers',
    change,
    foods,
  };
}

function clamp(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1))}\u2026`;
}

/**
 * Deterministic template used whenever the model is unavailable - this is
 * what users actually see when credits run out, so it is shaped like the
 * AI line (dish + change callback).
 */
export function fallbackAftercareCopy(ctx: AftercareContext): AftercareCopy {
  const title = clamp(`About those ${ctx.dish}\u2026`, PUSH_TITLE_MAX);
  const body = clamp(
    ctx.change ? `was the ${ctx.change} worth it?` : 'was saving it worth it?',
    PUSH_BODY_MAX,
  );
  return { title, body };
}

function isValidCopy(copy: AftercareCopy): boolean {
  const titleOk = copy.title.length <= PUSH_TITLE_MAX && copy.title.includes('\u2026');
  const bodyOk = copy.body.length <= PUSH_BODY_MAX && copy.body.trim().endsWith('?');
  return titleOk && bodyOk;
}

/**
 * Composes the aftercare line via the resilient LLM client (cheap OpenRouter
 * model). ANY failure degrades to the deterministic template.
 */
export async function writeAftercareCopy(
  ctx: AftercareContext,
  llm: LlmClient = createLlmClient(),
): Promise<AftercareCopy> {
  try {
    const result = await llm.completeJson({
      systemPrompt: SYSTEM_PROMPT,
      userContent: {
        originalDish: ctx.dish,
        change: ctx.change,
        foods: ctx.foods,
      },
      schema: aftercareCopySchema,
      modelName: env.OPENAI_TEXT_MODEL,
      maxTokens: 160,
    });
    const copy: AftercareCopy = { title: result.data.title, body: result.data.body };
    if (!isValidCopy(copy)) return fallbackAftercareCopy(ctx);
    return copy;
  } catch {
    // Heuristic client has no strategy for this schema and throws - that
    // is the designed signal to use templates (zero-network environments).
    return fallbackAftercareCopy(ctx);
  }
}

export const MAX_RESCUES_PER_TICK = 20;

export type AftercareSendResult =
  { outcome: 'skipped'; reason: string } | { outcome: PushOutcome; reason: string };

/**
 * Sends the aftercare check-in for ONE rescue, honouring every gate the
 * eligibility service defines (MEAL_COMPLETED, one push per rescue,
 * cooldown, FEEDBACK_DISABLED) plus the sendToUser governance gate.
 * Never throws.
 */
export async function sendAftercareForRescue(
  models: Pick<DbModels, 'Rescue' | 'User' | 'DecisionEvent'>,
  rescueId: UUID,
  now: Date = new Date(),
): Promise<AftercareSendResult> {
  const rescue = await models.Rescue.findByPk(rescueId, {
    attributes: ['id', 'userId', 'originalMeal', 'detectedIngredients', 'selectedRecommendation'],
  });
  if (!rescue) return { outcome: 'skipped', reason: 'NO_RESCUE' };

  const user = await models.User.findByPk(rescue.userId);
  if (!user) return { outcome: 'skipped', reason: 'NO_USER' };
  if (user.feedbackEnabled === false) return { outcome: 'skipped', reason: 'FEEDBACK_DISABLED' };

  const events = new DecisionEventService(models as unknown as Db['models']);
  const alreadySent = await events.countForRescue(rescueId, AFTERCARE_EVENT);
  if (alreadySent > 0) return { outcome: 'skipped', reason: 'ALREADY_SENT' };

  const completion = await models.DecisionEvent.findOne({
    where: { rescueId, eventType: 'MEAL_COMPLETED' },
    order: [['createdAt', 'DESC']],
  });
  const completedAt = completion?.createdAt
    ? new Date(completion.createdAt).getTime()
    : ((rescue as unknown as { createdAt: Date }).createdAt?.getTime() ?? Date.now());
  if (now.getTime() - completedAt < AFTERCARE_COOLDOWN_MS) {
    return { outcome: 'skipped', reason: 'COOLDOWN' };
  }

  const ctx = aftercareContextFromRescue(rescue);
  const copy = await writeAftercareCopy(ctx);

  const outcome = await sendToUser({
    user,
    kind: 'aftercare',
    title: copy.title,
    body: copy.body,
    deepLink: AFTERCARE_DEEP_LINK,
    buttons: AFTERCARE_BUTTONS,
    data: { rescueId, recommendation: ctx.change ?? ctx.dish },
  });

  if (outcome === 'sent' || outcome === 'dry_run') {
    // Ledger exactly as aftercare.service does: a delivered check-in counts
    // towards the "one aftercare push per rescue" rule in the DB.
    await events.record({
      eventType: AFTERCARE_EVENT,
      userId: rescue.userId,
      rescueId,
      payload: { kind: 'aftercare', reason: 'aftercare_checkin' },
    });
  }

  return { outcome, reason: outcome };
}

/**
 * Finds MEAL_COMPLETED events old enough for aftercare, dedupes per rescue,
 * and delivers in batches. Returns how many check-ins actually went out.
 */
export async function runAftercareTick(db?: Db, now: Date = new Date()): Promise<number> {
  const resolved: Db = db ?? { sequelize, models: sequelize.models as unknown as DbModels };
  const models: Pick<DbModels, 'Rescue' | 'User' | 'DecisionEvent'> = {
    Rescue: resolved.models.Rescue ?? Rescue,
    User: resolved.models.User ?? User,
    DecisionEvent: resolved.models.DecisionEvent,
  };

  const cutoff = new Date(now.getTime() - AFTERCARE_COOLDOWN_MS);

  // MEAL_COMPLETED can repeat for a rescue - distinct rescueIds below keep
  // a rescue from being processed twice in one tick.
  const completions =
    (await models.DecisionEvent.findAll({
      where: {
        eventType: 'MEAL_COMPLETED',
        rescueId: { [Op.ne]: null },
        createdAt: { [Op.lte]: cutoff },
      } as unknown as WhereOptions,
      order: [['createdAt', 'ASC']],
      attributes: ['rescueId'],
    })) ?? [];

  const rescueIds = [...new Set(completions.map((row) => row.rescueId as UUID))].slice(
    0,
    MAX_RESCUES_PER_TICK,
  );

  let sent = 0;
  for (const rescueId of rescueIds) {
    try {
      const result = await sendAftercareForRescue(models, rescueId, now);
      if (result.outcome === 'sent' || result.outcome === 'dry_run') sent += 1;
    } catch (err) {
      /* eslint-disable no-console */
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'aftercare tick failed for rescue',
          rescueId,
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
    await runAftercareTick();
  } catch (err) {
    /* eslint-disable no-console */
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'aftercare tick failed',
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    /* eslint-enable no-console */
  }
}

/** Starts the hourly cron job (idempotent). Only called outside test env. */
export function startAftercareScheduler(): void {
  if (scheduledTask) return;
  // :45 offsets the spoiler-alert job (:15) so the two never collide.
  const task = createTask('45 * * * *', () => {
    tickInFlight = safeTick().finally(() => {
      tickInFlight = null;
    });
  });
  task.start();
  scheduledTask = task;
}

export async function stopAftercareScheduler(): Promise<void> {
  if (!scheduledTask) return;
  const task = scheduledTask;
  scheduledTask = null;
  task.stop();
  if (tickInFlight) await tickInFlight.catch(() => undefined);
  await task.destroy();
}
