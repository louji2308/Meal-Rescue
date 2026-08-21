import { FastifyInstance } from 'fastify';

import { ErrorCategory } from '@meal-rescue/shared-types';

/**
 * Phase 2 stubs. Registered now so the API surface is visible in /docs
 * and clients can be built against a stable contract. Each endpoint
 * returns the structured error shape with a pointer to its phase.
 */
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

export async function mealRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/analyze',
    {
      schema: {
        description: 'Analyze a meal from image/text/voice input (Phase 2)',
        tags: ['meal'],
        response: { 501: { type: 'object', additionalProperties: true } },
      },
    },
    async (_request, reply) => {
      void reply.status(501).send(notImplemented('Phase 2', 'Meal analysis'));
    },
  );
}
