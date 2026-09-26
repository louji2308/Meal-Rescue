import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildServices } from '../services/composition';

const aiPlanSchema = z
  .object({
    text: z.string().min(1).max(2000),
    sessionId: z.string().min(1).max(64).nullish(),
  })
  .strict();

/**
 * Conversational AI planner routes.
 *
 * POST /api/v1/meal-memory/ai-plan   start (no sessionId) or continue (sessionId)
 *
 * The service runs a SESSION: continuing with the same sessionId reuses the
 * previous plan output + turn history, so an edit like "make dinner lighter"
 * edits the last plan instead of starting from scratch. The response carries
 * status "ready" (with a preview popup payload) or "clarification" (questions
 * for the user to answer), plus the sessionId to continue with.
 */
export async function aiPlannerRoutes(app: FastifyInstance): Promise<void> {
  const { aiPlanner } = buildServices(app.redis);

  app.post('/ai-plan', async (request, reply) => {
    const parsed = aiPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_AI_PLAN_INPUT',
        message: 'Body must be {"text": string, "sessionId"?: string}',
      });
    }

    const userId = request.user.sub;
    const { text, sessionId } = parsed.data;

    const result = await aiPlanner.plan(userId, sessionId ?? null, text);
    if (!result) {
      return reply.code(404).send({
        error: 'SESSION_NOT_FOUND',
        message: 'Session is unknown, expired, or belongs to another user. Start a new plan.',
      });
    }

    return reply.send(result);
  });
}
