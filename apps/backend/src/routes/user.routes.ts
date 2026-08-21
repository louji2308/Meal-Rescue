import { FastifyInstance } from 'fastify';

import { AppError } from '../lib/errors';
import { authService } from '../modules/auth/auth.service';

/** GET /api/v1/user/me - profile of the authenticated user. */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/me',
    {
      schema: {
        description: 'Return the authenticated user profile',
        tags: ['user'],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string' },
              subscriptionTier: { type: 'string', enum: ['free', 'pro'] },
              locale: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw AppError.unauthorized();
      }
      const user = await authService.getById(request.user.id);
      void reply.send({
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        locale: user.locale,
      });
    },
  );
}
