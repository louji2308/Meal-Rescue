/**
 * AI Rescue routes — real OpenRouter-powered meal intelligence.
 *
 * POST /api/v1/ai-rescue/generate  — single call, structured response
 * POST /api/v1/ai-rescue/negotiate — conversation loop
 *
 * v2: personalized with taste context
 */
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { Rescue } from '../database/models/rescue.model';
import { AppError } from '../lib/errors';
import { AiRescueService } from '../services/ai-rescue.service';
import { buildServices, dbModels } from '../services/composition';

const aiRescue = new AiRescueService();

/** Resolve the verified user id, or null when no token was presented. */
function authedUserId(request: { user?: { sub?: string } }): string | null {
  return request.user?.sub ?? null;
}

async function buildTasteContext(
  userId: string | null,
  services: Awaited<ReturnType<typeof buildServices>>,
): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const ctxBuilder = new (
      await import('../services/rescue-taste-context.service')
    ).RescueTasteContextBuilder(
      dbModels,
      services.tasteSensory,
      services.tasteTreatment,
      services.cuisineCompatibility,
      services.modificationMagnitude,
      services.tasteExposure,
      services.tasteEvents,
    );
    const ctx = await ctxBuilder.buildContext(userId);
    return ctxBuilder.formatForPrompt(ctx);
  } catch {
    // Taste context is optional — proceed without it
    return undefined;
  }
}

export async function aiRescueRoutes(app: FastifyInstance) {
  const services = buildServices(null);

  /**
   * POST /api/v1/ai-rescue/generate
   * Body: { foods, ingredients?, timeOfDay, userMood?, kitchenItems? }
   * Auth: Bearer token (optional — user ID extracted from token)
   */
  app.post('/api/v1/ai-rescue/generate', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const foods = body.foods as string[] | undefined;
    if (!foods || !Array.isArray(foods) || foods.length === 0) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'VALIDATION_ERROR',
        message: 'foods array is required',
        statusCode: 400,
      });
    }

    const timeOfDay = (body.timeOfDay as string) ?? 'afternoon';

    const tasteContext = await buildTasteContext(authedUserId(request), services);

    try {
      const result = await aiRescue.generateRescue({
        foods,
        ingredients: (body.ingredients as string[] | undefined) ?? [],
        timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
        userMood: body.userMood as string | undefined,
        kitchenItems: body.kitchenItems as
          | Array<{ name: string; state: string; expiresSoon: boolean }>
          | undefined,
        tasteContext,
      });

      // Persist a Rescue record so feedback can reference a real DB row.
      const rescueId = randomUUID();
      const userId = authedUserId(request);
      if (userId) {
        await Rescue.create({
          id: rescueId,
          mealId: randomUUID(), // placeholder — AI rescue has no Meal record
          userId,
          originalMeal: { foods },
          detectedIngredients: (body.ingredients as string[] | undefined) ?? [],
          constraints: {},
          candidatesGenerated: { feasible: 1, rankedCount: 1 },
          selectedRecommendation: {
            candidate: {
              id: 'ai-best',
              actionType: 'RESCUE',
              additions: result.whatYouAdded.map((name) => ({ name })),
              substitutions: [],
              estimatedMinutes: result.timeMinutes,
              estimatedCostLevel: 'low',
            },
            reasoning: result.reasoning,
            score: 1,
          },
          reasoning: result.reasoning,
          userDecision: 'pending',
          processingTimeMs: 0,
          modelVersion: 'ai-rescue:v1',
        });
      }

      return reply.send({ success: true, data: { ...result, rescueId } });
    } catch (err) {
      request.log.error({ err }, 'AI rescue generate failed');
      throw new AppError({
        category: ErrorCategory.EXTERNAL_SERVICE_FAILURE,
        code: 'AI_RESUCE_ERROR',
        message: 'The AI rescue service is temporarily unavailable',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Try again in a few moments',
        cause: err,
      });
    }
  });

  /**
   * POST /api/v1/ai-rescue/negotiate
   * Body: { conversation, originalFoods, pushback }
   */
  app.post('/api/v1/ai-rescue/negotiate', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const conversation = body.conversation as
      | Array<{ role: 'user' | 'ai'; content: string }>
      | undefined;
    const originalFoods = body.originalFoods as string[] | undefined;
    const pushback = body.pushback as string | undefined;

    if (!conversation || !originalFoods || !pushback) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'VALIDATION_ERROR',
        message: 'conversation, originalFoods, and pushback are required',
        statusCode: 400,
      });
    }

    const tasteContext = await buildTasteContext(authedUserId(request), services);

    try {
      const result = await aiRescue.negotiate({
        conversation,
        originalFoods,
        pushback,
        tasteContext,
      });

      return reply.send({ success: true, data: result });
    } catch (err) {
      request.log.error({ err }, 'AI rescue negotiate failed');
      throw new AppError({
        category: ErrorCategory.EXTERNAL_SERVICE_FAILURE,
        code: 'AI_NEGOTIATE_ERROR',
        message: 'The AI rescue service is temporarily unavailable',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Try again in a few moments',
        cause: err,
      });
    }
  });
}