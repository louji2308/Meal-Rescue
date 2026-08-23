import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AppError, ErrorCategory } from '../lib/errors';
import { snooze } from '../services/notifications/notification.service';

const snoozeSchema = z.object({
  kind: z.enum(['rescue_window', 'spoiler_alert']),
  hours: z.number().int().min(1).max(72),
});

/**
 * Notification preferences.
 *
 * Snooze closes the push loop: the mobile client posts it from the
 * notification's "remind me later" action and the ledger holds further
 * pushes of that kind until the deadline (max 72h - anti-fatigue cap).
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
}
