import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory, type RescueGenerateResponse } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const constraintsSchema = z
  .object({
    timeMinutes: z.number().int().min(1).max(240).optional(),
    budget: z.enum(['low', 'medium', 'high']).optional(),
    cookingRequired: z.boolean().optional(),
    equipmentAvailable: z.array(z.string().max(50)).max(20).optional(),
    avoidIngredients: z.array(z.string().max(80)).max(30).optional(),
    allergies: z.array(z.string().max(40)).max(20).optional(),
    keepOriginal: z.boolean().optional(),
    dietaryRestrictions: z
      .array(z.enum(['vegetarian', 'vegan', 'keto', 'paleo', 'halal', 'kosher']))
      .max(6)
      .optional(),
  })
  .strict();

const generateSchema = z.object({
  mealId: z.string().uuid(),
  constraints: constraintsSchema.default({}),
});

/**
 * POST /api/v1/rescue/generate
 *
 * Runs the full funnel and returns ONE recommendation plus at most TWO
 * alternatives (product rule: three choices maximum) with exactly the
 * four client actions.
 */
export async function rescueRoutes(app: FastifyInstance): Promise<void> {
  const { rescuePipeline } = buildServices(app.redis);

  app.post('/generate', async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_GENERATE_INPUT',
        message: 'Body must be {"mealId": uuid, "constraints"?: {...}}',
        statusCode: 400,
      });
    }

    const response: RescueGenerateResponse = await rescuePipeline.generateRescue(
      parsed.data.mealId,
      request.user.sub,
      parsed.data.constraints,
    );
    return reply.status(201).send(response);
  });

  // Feedback stays a Phase 4 stub - preference learning is out of scope here.
  app.post('/:id/feedback', async () => {
    throw new AppError({
      category: ErrorCategory.INTERNAL,
      code: 'NOT_IMPLEMENTED',
      message: 'Rescue feedback ships in Phase 4',
      statusCode: 501,
      recoverable: true,
      suggestedAction: 'Track progress in the Phase 4 milestone',
    });
  });
}
