import type { FastifyInstance } from 'fastify';

import type { AftercareEligibility } from '@meal-rescue/shared-types';

import { buildServices } from '../services/composition';

interface RescueParams {
  id: string;
}

/**
 * GET /api/v1/rescue/:id/aftercare-eligibility
 *
 * Returns whether the meal_completed check-in push can be sent for this rescue
 * (AftercareEligibility). With no OneSignal configured this still evaluates
 * eligibility (and dry-run logs) without sending anything.
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
}
