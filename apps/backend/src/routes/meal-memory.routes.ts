import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory, type MealMemoryCreateRuleRequest } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const intentRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});

const confirmRequestSchema = z.object({
  intentId: z.string().uuid(),
  answer: z.string().min(1).max(500),
});

const planWeekSchema = z
  .object({
    weekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mealSlots: z
      .array(z.enum(['breakfast', 'lunch', 'dinner', 'snack']))
      .min(1)
      .max(4)
      .optional(),
    strategy: z.enum(['balance', 'easy', 'use_expiring', 'family_favorites']).optional(),
    confirm: z.boolean().optional(),
    memberIds: z.array(z.string().uuid()).min(1).max(8).optional(),
  })
  .strict();

const weekQuerySchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  memberId: z.string().uuid().optional(),
});

const reuseWeekSchema = z
  .object({
    fromWeekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toWeekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

const eventParamSchema = z.object({ eventId: z.string().uuid() });

const updateMealSchema = z
  .object({
    concept: z.string().min(1).max(160).optional(),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    dateKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    state: z
      .enum([
        'PLANNED',
        'CONFIRMED',
        'EATEN',
        'SKIPPED',
        'REPLACED',
        'CANCELLED',
        'MOVED',
        'OPEN',
        'BLOCKED',
        'OUT',
      ])
      .optional(),
    slotStatus: z
      .enum(['LOCKED', 'PREFERRED', 'OPEN', 'FLEXIBLE', 'BLOCKED', 'OUT', 'UNKNOWN'])
      .optional(),
    memberIds: z.array(z.string().uuid()).optional(),
    effort: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

const moveMealSchema = z
  .object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  })
  .strict();

const recordActualSchema = z
  .object({
    dateKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    concept: z.string().min(1).max(160).optional(),
    skipped: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    ate: z.boolean().optional(),
  })
  .strict();

const rememberSchema = z
  .object({
    mealEventId: z.string().uuid().optional(),
    sentiment: z.enum(['loved', 'liked', 'not_for_us']),
    note: z.string().max(500).optional(),
    memberIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

const createRuleSchema = z
  .object({
    instructionType: z.enum([
      'EXCLUDE_INGREDIENT',
      'HOLD_INGREDIENT',
      'RESERVE_INGREDIENT',
      'BLOCK_SLOT',
      'KEEP_OPEN',
      'KEEP_OUT',
      'AVAILABILITY',
      'EFFORT',
      'PREFERENCE',
      'RECURRENCE',
      'GENERAL',
    ]),
    ingredient: z.string().min(1).max(160).optional(),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    scope: z.enum(['household', 'member', 'user']).optional(),
    memberId: z.string().uuid().optional(),
    detail: z.record(z.unknown()).optional(),
    expiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(500).optional(),
    priorityGroup: z.number().int().min(2).max(7).optional(),
  })
  .strict();

const feedbackSchema = z
  .object({
    mealEventId: z.string().uuid(),
    rating: z.enum(['loved', 'worked', 'not_really']),
    notes: z.string().max(500).optional(),
    memberIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

const suggestionsQuerySchema = z
  .object({
    weekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    strategy: z.enum(['balance', 'easy', 'use_expiring', 'family_favorites']).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

const useWhatYouHaveQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

const summaryQuerySchema = z
  .object({
    weekStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

/**
 * Meal Memory routes — the intent-aware household food agent.
 *
 * POST   /api/v1/meal-memory/intent           free-text instruction in
 * POST   /api/v1/meal-memory/confirm          resolve a pending intent
 * POST   /api/v1/meal-memory/plan-week        deterministic weekly plan
 * GET    /api/v1/meal-memory/week             calendar grid for a week
 * POST   /api/v1/meal-memory/reuse-week       copy last week's plan to a week
 * GET    /api/v1/meal-memory/recent           recently eaten meals
 * GET    /api/v1/meal-memory/suggestions      %-match smart suggestions for a week
 * GET    /api/v1/meal-memory/use-what-you-have  meal ideas from on-hand items
 * GET    /api/v1/meal-memory/summary          weekly intelligence digest
 * GET    /api/v1/meal-memory/meals/:eventId/detail
 * PATCH  /api/v1/meal-memory/meals/:eventId
 * POST   /api/v1/meal-memory/meals/:eventId/move
 * POST   /api/v1/meal-memory/meals/:eventId/remove
 * POST   /api/v1/meal-memory/record-actual    reality memory
 * POST   /api/v1/meal-memory/remember         store a taste opinion
 * POST   /api/v1/meal-memory/feedback         per-meal rating
 * POST   /api/v1/meal-memory/rules            explicit household rule
 * GET    /api/v1/meal-memory/rules            list active rules
 * POST   /api/v1/meal-memory/rules/:id/deactivate
 */
export async function mealMemoryRoutes(app: FastifyInstance): Promise<void> {
  const { mealMemory, mealIntelligence, householdMembers, households } = buildServices(app.redis);

  app.post('/intent', async (request, reply) => {
    const parsed = intentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_INTENT_INPUT',
        message: 'Body must be {"text": string}',
        statusCode: 400,
      });
    }
    await households.getOrCreateForUser(request.user.sub);
    void householdMembers;
    const response = await mealMemory.handleIntent(request.user.sub, parsed.data.text);
    return reply.send(response);
  });

  app.post('/confirm', async (request, reply) => {
    const parsed = confirmRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_CONFIRM_INPUT',
        message: 'Body must be {"intentId": uuid, "answer": string}',
        statusCode: 400,
      });
    }
    const response = await mealMemory.confirm(
      request.user.sub,
      parsed.data.intentId,
      parsed.data.answer,
    );
    return reply.send(response);
  });

  app.post('/plan-week', async (request, reply) => {
    const parsed = planWeekSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Body must be { weekStart?: 'YYYY-MM-DD', mealSlots?, strategy? }");
    }
    const response = await mealMemory.planWeek(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.get('/week', async (request, reply) => {
    const parsed = weekQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError("Query must be { weekStart?: 'YYYY-MM-DD', memberId?: uuid }");
    }
    const response = await mealMemory.getWeek(
      request.user.sub,
      parsed.data.weekStart,
      parsed.data.memberId,
    );
    return reply.send(response);
  });

  app.post('/reuse-week', async (request, reply) => {
    const parsed = reuseWeekSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError("Body must be { fromWeekStart?, toWeekStart?: 'YYYY-MM-DD' }");
    }
    const response = await mealMemory.reuseWeek(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.get('/recent', async (request, reply) => {
    const response = await mealMemory.recentMeals(request.user.sub);
    return reply.send(response);
  });

  app.get('/suggestions', async (request, reply) => {
    const parsed = suggestionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError('Query must be { weekStart?, mealSlot?, strategy?, limit? }');
    }
    const response = await mealIntelligence.suggestions(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.get('/use-what-you-have', async (request, reply) => {
    const parsed = useWhatYouHaveQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError('Query must be { limit? }');
    const response = await mealIntelligence.useWhatYouHave(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.get('/summary', async (request, reply) => {
    const parsed = summaryQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError('Query must be { weekStart?: YYYY-MM-DD }');
    const response = await mealIntelligence.summary(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.get('/meals/:eventId/detail', async (request, reply) => {
    const parsed = eventParamSchema.safeParse(request.params);
    if (!parsed.success) throw validationError('eventId must be a uuid');
    const response = await mealMemory.getMealDetail(request.user.sub, parsed.data.eventId);
    return reply.send(response);
  });

  app.post('/meals/:eventId/instructions', async (request, reply) => {
    const params = eventParamSchema.safeParse(request.params);
    if (!params.success) throw validationError('eventId must be a uuid');
    const body = z.object({
      concept: z.string().min(1).max(200),
      ingredients: z.array(z.string()).optional(),
      mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
    }).safeParse(request.body);
    if (!body.success) throw validationError('Body must be { concept, ingredients?, mealSlot? }');
    const response = await mealMemory.generateMealInstructions(
      request.user.sub,
      params.data.eventId,
      body.data.concept,
      body.data.ingredients,
      body.data.mealSlot,
    );
    return reply.send(response);
  });

  app.patch('/meals/:eventId', async (request, reply) => {
    const params = eventParamSchema.safeParse(request.params);
    const body = updateMealSchema.safeParse(request.body);
    if (!params.success || !body.success) throw validationError('Invalid meal update');
    const event = await mealMemory.updateMeal(request.user.sub, params.data.eventId, body.data);
    return reply.send({ event });
  });

  app.post('/meals/:eventId/move', async (request, reply) => {
    const params = eventParamSchema.safeParse(request.params);
    const body = moveMealSchema.safeParse(request.body);
    if (!params.success || !body.success) throw validationError('Invalid move body');
    const event = await mealMemory.moveMeal(request.user.sub, params.data.eventId, body.data);
    return reply.send({ event });
  });

  app.post('/meals/:eventId/remove', async (request, reply) => {
    const params = eventParamSchema.safeParse(request.params);
    if (!params.success) throw validationError('eventId must be a uuid');
    const event = await mealMemory.removeMeal(request.user.sub, params.data.eventId);
    return reply.send({ event });
  });

  app.post('/record-actual', async (request, reply) => {
    const parsed = recordActualSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid record body');
    const response = await mealMemory.recordActual(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.post('/remember', async (request, reply) => {
    const parsed = rememberSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid remember body');
    const response = await mealMemory.remember(request.user.sub, parsed.data);
    return reply.send(response);
  });

  app.post('/rules', async (request, reply) => {
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid rule body');
    const rule = await mealMemory.createRule(request.user.sub, {
      ...parsed.data,
      priorityGroup: parsed.data.priorityGroup as
        MealMemoryCreateRuleRequest['priorityGroup'] | undefined,
      scope: parsed.data.scope as MealMemoryCreateRuleRequest['scope'] | undefined,
      instructionType: parsed.data
        .instructionType as MealMemoryCreateRuleRequest['instructionType'],
    });
    return reply.send({ rule });
  });

  app.get('/rules', async (request, reply) => {
    const response = await mealMemory.listRules(request.user.sub);
    return reply.send(response);
  });

  app.post('/rules/:ruleId/deactivate', async (request, reply) => {
    const params = z
      .object({ ruleId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success) throw validationError('ruleId must be a uuid');
    const response = await mealMemory.deactivateRule(request.user.sub, params.data.ruleId);
    return reply.send(response);
  });

  app.post('/feedback', async (request, reply) => {
    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid feedback body');
    const response = await mealMemory.feedback(request.user.sub, parsed.data);
    return reply.send(response);
  });
}

function validationError(message: string): AppError {
  return new AppError({
    category: ErrorCategory.INPUT_VALIDATION,
    code: 'INVALID_MEAL_MEMORY_INPUT',
    message,
    statusCode: 400,
  });
}
