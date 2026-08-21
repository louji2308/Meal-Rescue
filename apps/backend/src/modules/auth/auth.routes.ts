import { FastifyInstance } from 'fastify';

import { loginSchema, registerSchema } from './auth.schemas';
import { authService } from './auth.service';

/**
 * Auth routes (public - excluded from the JWT hook):
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/register',
    {
      schema: {
        description: 'Create a new account and receive an access token',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            timezone: { type: 'string' },
            locale: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresIn: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  subscriptionTier: { type: 'string', enum: ['free', 'pro'] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }
      const tokens = await authService.register(parsed.data);
      void reply.status(201).send(tokens);
    },
  );

  app.post(
    '/login',
    {
      schema: {
        description: 'Exchange credentials for an access token',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresIn: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  subscriptionTier: { type: 'string', enum: ['free', 'pro'] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }
      const tokens = await authService.login(parsed.data);
      void reply.send(tokens);
    },
  );
}
