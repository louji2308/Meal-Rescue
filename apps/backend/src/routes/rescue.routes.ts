import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory, type RescueGenerateResponse } from '@meal-rescue/shared-types';

import { User } from '../database/models/user.model';
import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';
import { consumeRescueAllowance } from '../services/rescue-allowance.service';

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

const realitySchema = z
  .object({
    timeAvailable: z.union([z.literal(5), z.literal(15), z.literal(30)]).optional(),
    cookingAllowed: z.boolean(),
    budgetLevel: z.enum(['LOW', 'MEDIUM', 'OPEN']).optional(),
    useAvailableIngredients: z.boolean(),
    cleanupTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  })
  .strict();

const cravingSchema = z
  .object({
    primary: z.string().min(1).max(80),
    preservedElements: z.array(z.string().min(1).max(80)).max(10).default([]),
    flexibleElements: z.array(z.string().min(1).max(80)).max(10).default([]),
  })
  .strict();

const v2Schema = z
  .object({
    intent: z.enum(['SATISFY', 'PRESERVE', 'LIGHTEN', 'DECIDE', 'NO_COOK']).optional(),
    reality: realitySchema.optional(),
    craving: cravingSchema.optional(),
  })
  .strict();

const generateSchema = z.object({
  mealId: z.string().uuid(),
  constraints: constraintsSchema.default({}),
  v2: v2Schema.optional(),
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

    const user = await User.findByPk(request.user.sub);
    if (!user) throw AppError.notFound('User');

    const allowance = await consumeRescueAllowance(user);
    if (!allowance.allowed) {
      throw new AppError({
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        code: 'DAILY_RESCUE_LIMIT',
        message: 'Daily free rescue limit reached',
        statusCode: 429,
        recoverable: true,
        suggestedAction: 'Watch an ad for extra rescues or upgrade to Pro',
      });
    }

    const response: RescueGenerateResponse = await rescuePipeline.generateRescue(
      parsed.data.mealId,
      request.user.sub,
      parsed.data.constraints,
      parsed.data.v2,
    );
    return reply.status(201).send(response);
  });
}
