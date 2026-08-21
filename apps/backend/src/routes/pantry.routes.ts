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

export async function pantryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      schema: {
        description: 'List pantry items with expiry awareness (Phase 4)',
        tags: ['pantry'],
        response: { 501: { type: 'object', additionalProperties: true } },
      },
    },
    async (_request, reply) => {
      void reply.status(501).send(notImplemented('Phase 4', 'Pantry management'));
    },
  );
}
