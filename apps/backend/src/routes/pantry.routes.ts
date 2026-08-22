import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const upsertSchema = z.object({
  ingredientName: z.string().min(1).max(100),
  quantity: z.number().positive().max(1000).optional(),
  unit: z.string().max(20).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  usePriority: z.number().int().min(0).max(10).optional(),
});

interface PantryParams {
  id: string;
}

/**
 * GET  /api/v1/pantry          - list with expiry/low-stock awareness
 * POST /api/v1/pantry          - add or update item
 * DELETE /api/v1/pantry/:id    - remove item
 * POST /api/v1/pantry/:id/use  - mark as used (decrements qty, updates lastUsedAt)
 */
export async function pantryRoutes(app: FastifyInstance): Promise<void> {
  const { pantry: pantryService } = buildServices(app.redis);

  app.get('/', async (request, reply) => {
    const userId = request.user.sub;
    const pantry = await pantryService.getPantry(userId);
    return reply.send(pantry);
  });

  app.post('/', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_PANTRY_INPUT',
        message: 'Body must be { ingredientName, quantity?, unit?, expiresAt?, usePriority? }',
        statusCode: 400,
      });
    }
    const item = await pantryService.upsertItem(userId, parsed.data);
    return reply.status(201).send(item);
  });

  app.delete<{ Params: PantryParams }>('/:id', async (request, reply) => {
    const userId = request.user.sub;
    const itemId = request.params.id;
    const result = await pantryService.deleteItem(userId, itemId);
    return reply.send(result);
  });

  app.post<{ Params: PantryParams }>('/:id/use', async (request, reply) => {
    const userId = request.user.sub;
    const itemId = request.params.id;

    const { pantry: pantryServiceInner } = buildServices(app.redis);
    const row = await pantryServiceInner.getPantry(userId);
    const item = row.ingredients.find((i) => i.id === itemId);
    if (!item) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'PANTRY_ITEM_NOT_FOUND',
        message: 'Pantry item not found',
        statusCode: 404,
      });
    }

    await pantryServiceInner.markUsed(userId, item.ingredientName);
    return reply.send({ success: true });
  });
}

interface PantryParams {
  id: string;
}
