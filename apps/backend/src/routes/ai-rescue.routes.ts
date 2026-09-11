/**
 * AI Rescue routes — real OpenRouter-powered meal intelligence.
 *
 * POST /api/v1/ai-rescue/generate  — single call, structured response
 * POST /api/v1/ai-rescue/negotiate — conversation loop
 *
 * v2: personalized with taste context
 */
import type { FastifyInstance } from 'fastify';

import { AiRescueService } from '../services/ai-rescue.service';
import { buildServices, dbModels } from '../services/composition';

const aiRescue = new AiRescueService();

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
      return reply.status(400).send({
        success: false,
        error: { message: 'foods array is required', code: 'VALIDATION_ERROR' },
      });
    }

    const timeOfDay = (body.timeOfDay as string) ?? 'afternoon';

    // Build taste context if user is authenticated
    let tasteContext: string | undefined;
    const userId = (request as unknown as Record<string, unknown>).userId as string | undefined;
    if (userId) {
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
        tasteContext = ctxBuilder.formatForPrompt(ctx);
      } catch {
        // Taste context is optional — proceed without it
      }
    }

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

      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: {
          message: err instanceof Error ? err.message : 'AI rescue failed',
          code: 'AI_RESUCE_ERROR',
        },
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
      return reply.status(400).send({
        success: false,
        error: {
          message: 'conversation, originalFoods, and pushback are required',
          code: 'VALIDATION_ERROR',
        },
      });
    }

    // Build taste context if user is authenticated
    let tasteContext: string | undefined;
    const userId = (request as unknown as Record<string, unknown>).userId as string | undefined;
    if (userId) {
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
        tasteContext = ctxBuilder.formatForPrompt(ctx);
      } catch {
        // Taste context is optional
      }
    }

    try {
      const result = await aiRescue.negotiate({
        conversation,
        originalFoods,
        pushback,
        tasteContext,
      });

      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: {
          message: err instanceof Error ? err.message : 'AI negotiation failed',
          code: 'AI_NEGOTIATE_ERROR',
        },
      });
    }
  });
}
