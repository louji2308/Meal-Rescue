import { randomUUID } from 'node:crypto';

import { UniqueConstraintError } from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { NotificationLog } from '../../database/models/notification-log.model';
import { User } from '../../database/models/user.model';

/**
 * Push engagement orchestrator.
 *
 * Every push - regardless of which scheduler produced it - funnels through
 * sendToUser(), which enforces the anti-fatigue governance in one place:
 * 1. quiet hours (user-configured, defaulting to 22:00-08:00 local)
 * 2. snooze suppression (suppressedUntil in the future)
 * 3. once-per-kind-per-local-day dedupe via the uq_notification_dedupe index
 *
 * When OneSignal credentials are absent the engine runs in dry-run mode:
 * decisions are logged and ledgered exactly as if the push had been sent,
 * so tests and demos exercise identical code paths without network calls.
 */

const QUIET_DEFAULT_START = 22;
const QUIET_DEFAULT_END = 8;
const ONESIGNAL_ENDPOINT = 'https://api.onesignal.com/notifications';

export const NOTIFICATION_KINDS = [
  'spoiler_alert',
  'generic',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface PushButton {
  id: string;
  text: string;
}

export type PushOutcome = 'sent' | 'dry_run' | 'skipped_quiet' | 'snoozed' | 'deduped' | 'failed';

/** YYYY-MM-DD of the user's LOCAL day at the given instant. */
export function localDayKey(tzOffsetMinutes: number, date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Quiet-hours check in the user's LOCAL timeline. Null hours fall back to
 * the 22..8 wrap-around default; start === end means never quiet.
 */
export function isQuietHours(
  user: Pick<User, 'quietStartHour' | 'quietEndHour' | 'tzOffsetMinutes'>,
  date: Date = new Date(),
): boolean {
  const start = user.quietStartHour ?? QUIET_DEFAULT_START;
  const end = user.quietEndHour ?? QUIET_DEFAULT_END;
  if (start === end) return false;

  const localMinuteOfDay =
    (((date.getUTCHours() * 60 + date.getUTCMinutes() - (user.tzOffsetMinutes ?? 0)) % 1440) +
      1440) %
    1440;
  const hour = Math.floor(localMinuteOfDay / 60);

  // Wrap-around window (e.g. 22..8) spans midnight; a plain window does not.
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export async function wasNotified(userId: UUID, kind: string, dayKey: string): Promise<boolean> {
  return (await NotificationLog.count({ where: { userId, kind, dayKey } })) > 0;
}

/**
 * Ledger a push for today. The unique composite index makes this
 * idempotent: an existing row means "already notified today" and the
 * insert is silently dropped.
 */
export async function markNotified(userId: UUID, kind: string, dayKey: string): Promise<void> {
  try {
    await NotificationLog.create({ id: randomUUID(), userId, kind, dayKey });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return; // already notified
    throw err;
  }
}

/** Suppress pushes of `kind` until now + hours. Returns the new deadline. */
export async function snooze(userId: UUID, kind: string, hours: number): Promise<Date> {
  const user = await User.findByPk(userId, { attributes: ['tzOffsetMinutes'] });
  const dayKey = localDayKey(user?.tzOffsetMinutes ?? 0);
  const suppressedUntil = new Date(Date.now() + hours * 3_600_000);

  const [row] = await NotificationLog.findOrCreate({
    where: { userId, kind, dayKey },
    defaults: { id: randomUUID(), userId, kind, dayKey, suppressedUntil },
  });
  // Never shorten a longer snooze that is still active.
  if (!(row.suppressedUntil && row.suppressedUntil.getTime() >= suppressedUntil.getTime())) {
    await row.update({ suppressedUntil });
  }
  return suppressedUntil;
}

export interface SendPushInput {
  user: User;
  kind: NotificationKind | string;
  title: string;
  body: string;
  deepLink?: string;
  buttons?: PushButton[];
}

function logLine(level: 'info' | 'warn' | 'error', payload: Record<string, unknown>): void {
  // Structured line protocol mirrors ResilientLlmClient's degradation logs.
  /* eslint-disable no-console */
  if (level === 'error') {
    console.error(JSON.stringify({ level, msg: 'push', ...payload }));
  } else if (level === 'warn') {
    console.warn(JSON.stringify({ level, msg: 'push', ...payload }));
  } else {
    console.log(JSON.stringify({ level, msg: 'push', ...payload }));
  }
  /* eslint-enable no-console */
}

/**
 * Single gate every push must pass. Returns WHY nothing was delivered so
 * callers can log/aggregate outcomes; always ledger-marked unless skipped
 * before the dedupe stage (quiet/snooze), so a suppressed evening event
 * can still fire after quiet hours end... once per local day max.
 */
export async function sendToUser(input: SendPushInput): Promise<PushOutcome> {
  const { user, kind, title, body, deepLink, buttons } = input;
  const tz = user.tzOffsetMinutes ?? 0;
  const dayKey = localDayKey(tz);

  if (isQuietHours(user)) return 'skipped_quiet';

  const row = await NotificationLog.findOne({ where: { userId: user.id, kind, dayKey } });
  if (row?.suppressedUntil && row.suppressedUntil.getTime() > Date.now()) return 'snoozed';
  if (row) return 'deduped';

  const enabled = Boolean(env.ONESIGNAL_REST_KEY && env.ONESIGNAL_APP_ID);
  let outcome: PushOutcome = enabled ? 'sent' : 'dry_run';

  if (enabled) {
    const payload: Record<string, unknown> = {
      app_id: env.ONESIGNAL_APP_ID,
      include_aliases: { external_id: [user.id] },
      target_channel: 'push',
      headings: { en: title },
      contents: { en: body },
      data: {
        ...(deepLink ? { deepLink } : {}),
        kind,
      },
    };
    if (buttons && buttons.length > 0) {
      payload.buttons = buttons.map((b) => ({ id: b.id, text: b.text }));
    }

    const maxRetries = 3;
    let lastError: { status?: number; responseBody?: string; message: string } | null = null;
    let succeeded = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(ONESIGNAL_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${env.ONESIGNAL_REST_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          succeeded = true;
          break;
        }

        const responseBody = await response.text().catch(() => '(unreadable)');
        const status = response.status;

        lastError = { status, responseBody, message: `HTTP ${status}` };

        // Only retry on 429 and 5xx; all other 4xx are terminal.
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = { message };
        // Network errors are transient — retry.
        if (attempt === maxRetries) break;
        const delayMs = 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!succeeded) {
      outcome = 'failed';
      logLine('error', {
        outcome,
        userId: user.id,
        kind,
        status: lastError?.status,
        responseBody: lastError?.responseBody,
        reason: lastError?.message,
      });
    }
  }

  if (outcome === 'sent' || outcome === 'dry_run') {
    // Ledger on success or dry-run so deduplication still works.
    // On 'failed', skip so the next scheduler cycle can retry.
    await markNotified(user.id, kind, dayKey);
    logLine('info', { outcome, userId: user.id, kind, title });
  }
  return outcome;
}

export async function validateOneSignalCredentials(): Promise<{ valid: boolean; error?: string }> {
  if (!env.ONESIGNAL_REST_KEY || !env.ONESIGNAL_APP_ID) {
    return { valid: false, error: 'ONESIGNAL_REST_KEY or ONESIGNAL_APP_ID is not set' };
  }

  try {
    const response = await fetch(
      `https://onesignal.com/api/v1/apps/${env.ONESIGNAL_APP_ID}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${env.ONESIGNAL_REST_KEY}`,
        },
      },
    );

    if (response.ok) {
      return { valid: true };
    }

    const body = await response.text().catch(() => '(unreadable)');
    return { valid: false, error: `HTTP ${response.status}: ${body}` };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
