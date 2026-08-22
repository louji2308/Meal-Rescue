import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { FridgeNegotiatorService } from '../services/fridge-negotiator.service';

const negotiateSchema = z.object({
  availableIngredients: z.array(z.string().min(1).max(80)).min(1).max(30),
  timeMinutes: z.number().int().min(1).max(240),
  hungerLevel: z.enum(['snack', 'meal']).optional(),
});

/**
 * POST /api/v1/fridge/negotiate
 *
 * "I'm hungry, here's what I have" -> returns up to 3 meal recommendations
 * with missing ingredients listed.
 */
export async function fridgeRoutes(app: FastifyInstance): Promise<void> {
  const negotiator = new FridgeNegotiatorService();

  app.post('/negotiate', async (request, reply) => {
    const userId = request.user.sub;

    const parsed = negotiateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_NEGOTIATE_INPUT',
        message:
          'Body must be { availableIngredients: string[], timeMinutes: number, hungerLevel?: "snack" | "meal" }',
        statusCode: 400,
      });
    }

    const response = await negotiator.negotiate({
      ...parsed.data,
      userId,
    });

    return reply.status(201).send(response);
  });
}
