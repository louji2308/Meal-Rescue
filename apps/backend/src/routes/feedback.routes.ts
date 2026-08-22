import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const feedbackSchema = z.object({
  satisfaction: z.enum(['better', 'same', 'not_for_me']),
  feedbackText: z.string().max(500).optional(),
  outcome: z
    .object({
      completed: z.boolean(),
      modifications: z.array(z.string().max(100)).max(10).optional(),
      actualTime: z.number().int().min(0).max(300).optional(),
    })
    .optional(),
});

interface FeedbackParams {
  id: string;
}

/**
 * POST /api/v1/rescue/:id/feedback
 *
 * Submit post-rescue satisfaction feedback. Triggers preference learning.
 */
export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  const { feedback: feedbackService } = buildServices(app.redis);

  app.post<{ Params: FeedbackParams }>('/:id/feedback', async (request, reply) => {
    const rescueId = request.params.id;
    const userId = request.user.sub;

    const parsed = feedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_FEEDBACK_INPUT',
        message: 'Body must be { satisfaction, feedbackText?, outcome? }',
        statusCode: 400,
      });
    }

    const response = await feedbackService.submitFeedback(rescueId, userId, parsed.data);

    return reply.status(201).send(response);
  });
}
