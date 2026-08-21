import { FastifyInstance } from 'fastify';

import { ErrorCategory } from '@meal-rescue/shared-types';

function notImplemented(phase: string, feature: string) {
  return {
    success: false as const,
    error: {
      category: ErrorCategory.INTERNAL,
      code: 'NOT_IMPLEMENTED',
      message: `${feature} ships in ${phase}`,
      recoverable: true,
      suggestedAction: `Track progress in the ${phase} milestone`,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function rescueRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/generate',
    {
      schema: {
        description: 'Generate a minimum-intervention rescue for a meal (Phase 2)',
        tags: ['rescue'],
        response: { 501: { type: 'object', additionalProperties: true } },
      },
    },
    async (_request, reply) => {
      void reply.status(501).send(notImplemented('Phase 2', 'Rescue generation'));
    },
  );

  app.post(
    '/:id/feedback',
    {
      schema: {
        description: 'Record satisfaction feedback for a rescue (Phase 4)',
        tags: ['rescue'],
        response: { 501: { type: 'object', additionalProperties: true } },
      },
    },
    async (_request, reply) => {
      void reply.status(501).send(notImplemented('Phase 4', 'Rescue feedback'));
    },
  );
}
