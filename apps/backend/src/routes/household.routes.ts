import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const createHouseholdSchema = z.object({
  name: z.string().min(1).max(60).optional(),
});

const createMemberSchema = z.object({
  displayName: z.string().min(1).max(120),
  relationship: z
    .enum(['self', 'partner', 'child', 'family', 'roommate', 'friend', 'other'])
    .optional(),
  constraints: z
    .object({
      allergies: z.array(z.string().min(1).max(80)).default([]),
      dietaryRestrictions: z
        .array(z.enum(['vegetarian', 'vegan', 'keto', 'paleo', 'halal', 'kosher']))
        .default([]),
      avoidIngredients: z.array(z.string().min(1).max(80)).default([]),
    })
    .optional(),
  preferences: z
    .object({
      likes: z.array(z.string().min(1).max(80)).default([]),
      dislikes: z.array(z.string().min(1).max(80)).default([]),
      spiceLevel: z.enum(['mild', 'medium', 'spicy']).optional(),
      textures: z.array(z.string().min(1).max(40)).optional(),
    })
    .optional(),
});

const updateMemberSchema = createMemberSchema.partial().extend({
  active: z.boolean().optional(),
});

const memberIdParam = z.object({ id: z.string().uuid() });

/**
 * Household routes — the human table a Common Table session is planned for.
 *
 * GET    /api/v1/households/current - current user's household (or null)
 * POST   /api/v1/households          - idempotently get or create a household
 * POST   /api/v1/households/members  - add a member profile
 * PATCH  /api/v1/households/members/:id - update constraints/preferences
 * DELETE /api/v1/households/members/:id - remove a non-owner member
 */
export async function householdRoutes(app: FastifyInstance): Promise<void> {
  const { households, householdMembers } = buildServices(app.redis);

  app.get('/current', async (request, reply) => {
    const userId = request.user.sub;
    const household = await households.getForUser(userId);
    return reply.send({ household });
  });

  app.post('/', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = createHouseholdSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_HOUSEHOLD_INPUT',
        message: 'Body must be { name? }',
        statusCode: 400,
      });
    }
    // Idempotent: existing household (plus owner member) is returned as-is.
    const household = await households.createForUser(userId, parsed.data.name);
    return reply.send({ household });
  });

  app.post('/members', async (request, reply) => {
    const userId = request.user.sub;
    const parsed = createMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_MEMBER_INPUT',
        message: 'Body must be { displayName, relationship?, constraints?, preferences? }',
        statusCode: 400,
      });
    }

    const household = await households.getOrCreateForUser(userId);
    const member = await householdMembers.create(household.id, parsed.data);
    return reply.send({ member });
  });

  app.patch('/members/:id', async (request, reply) => {
    const userId = request.user.sub;
    const param = memberIdParam.parse(request.params);
    const parsed = updateMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_MEMBER_INPUT',
        message: 'Body must contain at least one member field to update',
        statusCode: 400,
      });
    }

    const household = await households.getOrCreateForUser(userId);
    const member = await householdMembers.update(household.id, param.id, parsed.data);
    return reply.send({ member });
  });

  app.delete('/members/:id', async (request, reply) => {
    const userId = request.user.sub;
    const param = memberIdParam.parse(request.params);

    const household = await households.getOrCreateForUser(userId);
    const removed = await householdMembers.remove(household.id, param.id);
    return reply.send({ removed });
  });
}
