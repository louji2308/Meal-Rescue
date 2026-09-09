import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const decideSchema = z
  .object({
    action: z.enum(['accepted', 'swapped', 'rejected', 'kept_as_is']),
  })
  .strict();

interface RescueParams {
  id: string;
}

/**
 * V2 decision commit (plan §9 / §27).
 *
 * POST /api/v1/rescue/:id/decide
 *
 * Body: { "action": "accepted" | "swapped" | "rejected" | "kept_as_is" }
 *
 * Flips rescue.userDecision off 'pending' and logs a RECOMMENDATION_SELECTED
 * event. Last write wins — a user may preview and re-decide before completing.
 * Subsequent satisfaction feedback (and the meal_completed aftercare gate)
 * depend on this call succeeding first.
 */
export async function decisionRoutes(app: FastifyInstance): Promise<void> {
  const { decision } = buildServices(app.redis);

  app.post<{ Params: RescueParams }>('/:id/decide', async (request, reply) => {
    const parsed = decideSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_DECIDE_INPUT',
        message: 'Body must be {"action": "accepted"|"swapped"|"rejected"|"kept_as_is"}',
        statusCode: 400,
        recoverable: true,
      });
    }

    const response = await decision.commit(request.params.id, request.user.sub, parsed.data.action);
    return reply.status(201).send(response);
  });
}
