import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';
import {
  KitchenIntelligenceService,
  type WhatCanIMakeResponse,
} from '../services/kitchen-intelligence.service';

const identifySchema = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.string().default('image/jpeg'),
});

const whatCanIMakeSchema = z.object({
  cuisine: z.string().max(50).optional(),
  timeAvailable: z.number().int().positive().max(120).optional(),
});

/**
 * Kitchen intelligence routes — the brain of the Kitchen tab.
 *
 * GET  /api/v1/kitchen              - Dashboard with signals + opportunities
 * POST /api/v1/kitchen/identify      - Camera food recognition (vision AI)
 * POST /api/v1/kitchen/what-can-i-make - "What can I make?" (DeepSeek reasoning)
 */
export async function kitchenRoutes(app: FastifyInstance): Promise<void> {
  const { pantry: pantryService } = buildServices(app.redis);
  const intelligence = new KitchenIntelligenceService(pantryService);

  app.get('/', async (request, reply) => {
    const userId = request.user.sub;
    const dashboard = await intelligence.getDashboard(userId);
    return reply.send(dashboard);
  });

  app.post('/identify', async (request, reply) => {
    const parsed = identifySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_KITCHEN_INPUT',
        message: 'Body must be { imageBase64, mimeType? }',
        statusCode: 400,
      });
    }

    const result = await intelligence.identifyFood(
      parsed.data.imageBase64,
      parsed.data.mimeType,
    );
    return reply.send(result);
  });

  app.post('/what-can-i-make', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = whatCanIMakeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_KITCHEN_INPUT',
        message: 'Body must be { cuisine?, timeAvailable? }',
        statusCode: 400,
      });
    }

    const result: WhatCanIMakeResponse = await intelligence.whatCanIMake(userId, {
      cuisine: parsed.data.cuisine,
      timeAvailable: parsed.data.timeAvailable,
    });
    return reply.send(result);
  });
}
