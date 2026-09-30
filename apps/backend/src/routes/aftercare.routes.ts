import type { FastifyInstance } from 'fastify';

import type { AftercareEligibility } from '@meal-rescue/shared-types';

import { DecisionEvent } from '../database/models/decision-event.model';
import { Rescue } from '../database/models/rescue.model';
import { User } from '../database/models/user.model';
import { AppError, ErrorCategory } from '../lib/errors';
import { buildServices } from '../services/composition';
import { sendAftercareForRescue } from '../services/v2/aftercare-notification.service';

interface RescueParams {
  id: string;
}

/**
 * GET /api/v1/rescue/:id/aftercare-eligibility
 *
 * Returns whether the meal_completed check-in push can be sent for this rescue
 * (AftercareEligibility). With no OneSignal configured this still evaluates
 * eligibility (and dry-run logs) without sending anything.
 *
 * POST /api/v1/rescue/:id/aftercare-notify
 *
 * Fires the aftercare check-in immediately - the client calls this right after
 * the user commits "Do this" on the best-move screen so the demo push lands in
 * seconds instead of waiting for the 30-minute cooldown + hourly cron. Skips
 * only the cooldown and governance gates; the one-check-in-per-rescue ledger
 * still applies, so the cron never sends a duplicate later.
 */
export async function aftercareRoutes(app: FastifyInstance): Promise<void> {
  const { aftercare } = buildServices(app.redis);

  app.get<{ Params: RescueParams }>('/:id/aftercare-eligibility', async (request, reply) => {
    const eligibility: AftercareEligibility = await aftercare.eligibility(
      request.params.id,
      request.user.sub,
    );
    return reply.send(eligibility);
  });

  app.post<{ Params: RescueParams }>('/:id/aftercare-notify', async (request, reply) => {
    const owned = await Rescue.count({
      where: { id: request.params.id, userId: request.user.sub },
    });
    if (owned === 0) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'RESCUE_NOT_FOUND',
        message: 'Rescue not found',
        statusCode: 404,
        recoverable: false,
      });
    }

    const result = await sendAftercareForRescue(
      { Rescue, User, DecisionEvent },
      request.params.id,
      new Date(),
      { immediate: true },
    );
    return reply.send(result);
  });
}
