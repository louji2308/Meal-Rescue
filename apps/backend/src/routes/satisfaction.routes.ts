import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const satisfactionBodySchema = z.object({
  result: z.enum(['EXACTLY', 'ALMOST', 'NOT_REALLY']),
  reason: z.array(z.string().min(1).max(60)).max(10).optional(),
});

interface RescueParams {
  id: string;
}

/**
 * V2 satisfaction loop (plan §8, §17).
 *
 * POST   /api/v1/rescue/:id/satisfaction  -> record "did that hit the spot?"
 * GET    /api/v1/rescue/:id/satisfaction  -> fetch the record (small win)
 */
export async function satisfactionRoutes(app: FastifyInstance): Promise<void> {
  const { satisfaction } = buildServices(app.redis);

  app.post<{ Params: RescueParams }>('/:id/satisfaction', async (request, reply) => {
    const parsed = satisfactionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_SATISFACTION_INPUT',
        message: 'Body must be {"result": "EXACTLY"|"ALMOST"|"NOT_REALLY", "reason"?: string[]}',
        statusCode: 400,
        recoverable: true,
      });
    }

    const response = await satisfaction.record(request.params.id, request.user.sub, parsed.data);
    return reply.status(201).send(response);
  });

  app.get<{ Params: RescueParams }>('/:id/satisfaction', async (request, reply) => {
    const record = await satisfaction.getForRescue(request.params.id, request.user.sub);
    if (!record) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'SATISFACTION_NOT_FOUND',
        message: 'No satisfaction recorded for this rescue yet',
        statusCode: 404,
        recoverable: true,
      });
    }
    return reply.send({ success: true, recorded: record });
  });
}
