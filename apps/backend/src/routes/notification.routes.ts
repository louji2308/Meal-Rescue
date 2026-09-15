import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { randomUUID } from 'node:crypto';

import { User } from '../database/models/user.model';
import { AppError, ErrorCategory } from '../lib/errors';
import { sendToUser, snooze, localDayKey } from '../services/notifications/notification.service';
import { NotificationLog } from '../database/models/notification-log.model';

const snoozeSchema = z.object({
  kind: z.enum(['rescue_window', 'spoiler_alert']),
  hours: z.number().int().min(1).max(72),
});

const dismissSchema = z.object({
  kind: z.enum(['pick_for_me']),
});

const testPushSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(40),
  body: z.string().min(1).max(90),
  buttons: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  deepLink: z.string().optional(),
});

/**
 * Notification preferences.
 *
 * Snooze closes the push loop: the mobile client posts it from the
 * notification's "remind me later" action and the ledger holds further
 * pushes of that kind until the deadline (max 72h - anti-fatigue cap).
 *
 * Dismiss records a lightweight negative signal so the recommendation
 * engine knows the user declined tonight's suggestion.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/snooze', async (request) => {
    const parsed = snoozeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_SNOOZE',
        message: 'Body must be {"kind":"rescue_window"|"spoiler_alert","hours":1-72}',
        statusCode: 400,
        recoverable: true,
        suggestedAction: 'Send a valid kind and an hour value between 1 and 72',
      });
    }
    const suppressedUntil = await snooze(request.user.sub, parsed.data.kind, parsed.data.hours);
    return { suppressedUntil: suppressedUntil.toISOString() };
  });

  /**
   * POST /dismiss - records that the user declined a "Pick For Me"
   * recommendation. This suppresses another pick_for_me push for
   * the rest of the evening (until end of local day).
   */
  app.post('/dismiss', async (request) => {
    const parsed = dismissSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_DISMISS',
        message: 'Body must be {"kind":"pick_for_me"}',
        statusCode: 400,
        recoverable: true,
        suggestedAction: 'Send kind: "pick_for_me"',
      });
    }
    const userId = request.user.sub;
    const user = await NotificationLog.sequelize?.models.User?.findByPk(userId, {
      attributes: ['tzOffsetMinutes'],
    });
    const tzOffset = (user as { tzOffsetMinutes?: number } | null)?.tzOffsetMinutes ?? 0;
    const dayKey = localDayKey(tzOffset);

    // Mark as notified so no more pick_for_me pushes today
    try {
      await NotificationLog.create({
        id: randomUUID(),
        userId,
        kind: parsed.data.kind,
        dayKey,
      });
    } catch {
      // Already exists - that's fine
    }

    return { dismissed: true };
  });

  /**
   * POST /test-push - Manual test endpoint to send a push notification
   * to any user. Bypasses anti-fatigue checks (quiet hours, snooze, dedup).
   * Requires authentication.
   */
  app.post('/test-push', async (request) => {
    const parsed = testPushSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_TEST_PUSH',
        message: 'Invalid test push payload',
        statusCode: 400,
        recoverable: true,
        suggestedAction: 'Provide userId (UUID), title (max 40 chars), body (max 90 chars)',
        details: { issues: parsed.error.flatten().fieldErrors },
      });
    }

    const targetUser = await User.findByPk(parsed.data.userId);
    if (!targetUser) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'USER_NOT_FOUND',
        message: `User ${parsed.data.userId} not found`,
        statusCode: 404,
        recoverable: true,
      });
    }

    const outcome = await sendToUser({
      user: targetUser,
      kind: 'generic',
      title: parsed.data.title,
      body: parsed.data.body,
      buttons: parsed.data.buttons,
      deepLink: parsed.data.deepLink,
    });

    if (outcome === 'failed') {
      return { success: false, error: `Push failed (outcome: ${outcome})` };
    }

    return { success: true, message: 'Test push sent', outcome };
  });
}
