import { FastifyInstance } from 'fastify';

import { googleLoginSchema, loginSchema, registerSchema } from './auth.schemas';
import { authService } from './auth.service';
import { User } from '../../database/models/user.model';

/**
 * Auth routes (public - excluded from the JWT hook):
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/google
 *   POST /api/v1/auth/check-email
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/check-email',
    {
      schema: {
        description: 'Check if an email is already registered',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              exists: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const user = await User.findOne({ where: { email: email.toLowerCase() } });
      void reply.send({ exists: !!user });
    },
  );

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
                  onboardingCompleted: { type: 'boolean' },
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
                  onboardingCompleted: { type: 'boolean' },
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

  app.post(
    '/google',
    {
      schema: {
        description: 'Sign in with Google authorization code',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['code', 'redirectUri'],
          properties: {
            code: { type: 'string' },
            redirectUri: { type: 'string' },
            codeVerifier: { type: 'string' },
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
                  onboardingCompleted: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = googleLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }
      const tokens = await authService.googleLogin(parsed.data);
      void reply.send(tokens);
    },
  );
}
