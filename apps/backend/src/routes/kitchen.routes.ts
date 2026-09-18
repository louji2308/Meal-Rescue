import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices, dbModels } from '../services/composition';
import { createLlmClient } from '../services/ai/llm-factory';
import {
  KitchenIntelligenceService,
  type WhatCanIMakeResponse,
} from '../services/kitchen-intelligence.service';
import { KitchenCaptureService } from '../services/kitchen-capture.service';

const identifySchema = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.string().default('image/jpeg'),
});

const whatCanIMakeSchema = z.object({
  cuisine: z.string().max(50).optional(),
  timeAvailable: z.number().int().positive().max(120).optional(),
});

const captureSchema = z.union([
  z.object({
    source: z.enum(['CAMERA', 'PHOTO']),
    imageBase64: z.string().min(100),
    mimeType: z.string().default('image/jpeg'),
  }),
  z.object({
    source: z.literal('MANUAL'),
    text: z.string().min(1).max(2000),
  }),
]);

const captureConfirmSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      accepted: z.boolean(),
      displayName: z.string().max(120).optional(),
      itemType: z.enum(['INGREDIENT', 'PREPARED_MEAL', 'LEFTOVER', 'PACKAGED_FOOD']).optional(),
      state: z.enum(['RAW', 'COOKED', 'READY_TO_EAT', 'UNKNOWN']).optional(),
      quantity: z.number().nullable().optional(),
      unit: z.string().max(30).nullable().optional(),
      duplicateAction: z.enum(['UPDATE', 'ADD_MORE', 'SKIP']).optional(),
    }),
  ),
});

/**
 * Kitchen intelligence routes — the brain of the Kitchen tab.
 *
 * GET  /api/v1/kitchen              - Dashboard with signals + opportunities
 * POST /api/v1/kitchen/identify      - Camera food recognition (vision AI)
 * POST /api/v1/kitchen/what-can-i-make - "What can I make?" (DeepSeek reasoning)
 * POST /api/v1/kitchen/capture       - Kitchen Capture (image/text → structured items)
 * POST /api/v1/kitchen/capture/confirm - Save confirmed capture items to pantry
 */
export async function kitchenRoutes(app: FastifyInstance): Promise<void> {
  const { pantry: pantryService } = buildServices(app.redis);
  const intelligence = new KitchenIntelligenceService(pantryService);
  const llm = createLlmClient();
  const capture = new KitchenCaptureService(llm, dbModels, app.redis);

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

  app.post('/capture', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = captureSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_CAPTURE_INPUT',
        message: 'Body must be { source: "CAMERA"|"PHOTO", imageBase64 } or { source: "MANUAL", text }',
        statusCode: 400,
      });
    }

    const result = await capture.capture(userId, parsed.data as any);
    return reply.send(result);
  });

  app.post('/capture/confirm', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = captureConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_CONFIRM_INPUT',
        message: 'Body must be { items: CaptureConfirmRequestItem[] }',
        statusCode: 400,
      });
    }

    const result = await capture.confirm(userId, parsed.data);
    return reply.send(result);
  });
}
