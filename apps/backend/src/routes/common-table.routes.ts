import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const convergeSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(12),
  ingredients: z.array(z.string().min(1).max(80)).max(40).optional(),
  ingredientSource: z.enum(['text', 'image', 'kitchen', 'any']).optional(),
  imageBase64: z.string().min(100).optional(),
  effort: z.enum(['quick', 'normal']).optional(),
  timeMinutes: z.number().int().positive().max(180).optional(),
  shoppingAllowed: z.boolean().optional(),
});

const mealIdParam = z.object({ sharedMealId: z.string().uuid() });

const completeSchema = z.object({
  finishResults: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        status: z.enum(['applied', 'skipped', 'swapped']),
      }),
    )
    .max(24)
    .optional(),
});

const feedbackSchema = z.object({
  householdRating: z.enum(['loved', 'worked', 'not_really']),
  remember: z.string().min(1).max(500).optional(),
  memberOutcomes: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        rating: z.enum(['loved', 'worked', 'not_really']),
        notes: z.string().max(500).optional(),
      }),
    )
    .max(24)
    .optional(),
  finishResults: z
    .array(
      z.object({
        memberId: z.string().uuid(),
        status: z.enum(['applied', 'skipped', 'swapped']),
        swappedTo: z.string().max(120).optional(),
      }),
    )
    .max(24)
    .optional(),
});

/**
 * Common Table routes — one shared base, everyone's own finish.
 *
 * POST /api/v1/common-table/converge        - generate + persist the plan
 * GET  /api/v1/common-table/:sharedMealId   - resume a session mid-cook
 * POST /api/v1/common-table/:sharedMealId/start    - started cooking
 * POST /api/v1/common-table/:sharedMealId/split    - split point reached
 * POST /api/v1/common-table/:sharedMealId/complete - all finishes served
 * POST /api/v1/common-table/:sharedMealId/feedback - how did it go? (learns)
 */
export async function commonTableRoutes(app: FastifyInstance): Promise<void> {
  const { commonTable } = buildServices(app.redis);

  app.post('/converge', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = convergeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_COMMON_TABLE_INPUT',
        message: 'Body must be { memberIds, ingredients?, ingredientSource?, ... }',
        statusCode: 400,
      });
    }

    const result = await commonTable.converge(userId, parsed.data);
    return reply.send(result);
  });

  app.get('/:sharedMealId', async (request, reply) => {
    const userId = request.user.sub;
    const { sharedMealId } = mealIdParam.parse(request.params);
    const result = await commonTable.get(userId, sharedMealId);
    return reply.send(result);
  });

  app.post('/:sharedMealId/start', async (request, reply) => {
    const userId = request.user.sub;
    const { sharedMealId } = mealIdParam.parse(request.params);
    return reply.send(await commonTable.startCooking(userId, sharedMealId));
  });

  app.post('/:sharedMealId/split', async (request, reply) => {
    const userId = request.user.sub;
    const { sharedMealId } = mealIdParam.parse(request.params);
    return reply.send(await commonTable.splitReached(userId, sharedMealId));
  });

  app.post('/:sharedMealId/complete', async (request, reply) => {
    const userId = request.user.sub;
    const { sharedMealId } = mealIdParam.parse(request.params);
    const parsed = completeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_COMPLETE_INPUT',
        message: 'Body must be { finishResults? }',
        statusCode: 400,
      });
    }

    return reply.send(await commonTable.complete(userId, sharedMealId, parsed.data));
  });

  app.post('/:sharedMealId/feedback', async (request, reply) => {
    const userId = request.user.sub;
    const { sharedMealId } = mealIdParam.parse(request.params);
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_FEEDBACK_INPUT',
        message: 'Body must be { householdRating, remember?, memberOutcomes?, finishResults? }',
        statusCode: 400,
      });
    }

    return reply.send(await commonTable.feedback(userId, sharedMealId, parsed.data));
  });
}
