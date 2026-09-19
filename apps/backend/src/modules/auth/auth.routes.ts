import { FastifyInstance } from 'fastify';

import {
  googleLoginSchema,
  loginSchema,
  registerSchema,
  sendCodeSchema,
  verifyCodeSchema,
} from './auth.schemas';
import { authService } from './auth.service';
import { User } from '../../database/models/user.model';
import { isDisposableEmail } from '../../services/disposable-emails';
import { emailVerificationService } from '../../services/email-verification.service';
import { AppError } from '../../lib/errors';

/**
 * Auth routes (public - excluded from the JWT hook):
 *   POST /api/v1/auth/check-email
 *   POST /api/v1/auth/send-code
 *   POST /api/v1/auth/verify-code
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/google
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
              disposable: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalizedEmail = email.toLowerCase().trim();

      // Block disposable emails at the gate
      if (isDisposableEmail(normalizedEmail)) {
        throw AppError.badRequest(
          'DISPOSABLE_EMAIL',
          'Disposable or temporary email addresses are not allowed. Please use a permanent email.',
        );
      }

      const user = await User.findOne({ where: { email: normalizedEmail } });
      void reply.send({ exists: !!user, disposable: false });
    },
  );

  app.post(
    '/send-code',
    {
      schema: {
        description: 'Send a verification code to the given email',
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
              sent: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = sendCodeSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const { email } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      // Block disposable emails
      if (isDisposableEmail(normalizedEmail)) {
        throw AppError.badRequest(
          'DISPOSABLE_EMAIL',
          'Disposable or temporary email addresses are not allowed.',
        );
      }

      const result = await emailVerificationService.sendCode(app.redis, normalizedEmail);
      void reply.send(result);
    },
  );

  app.post(
    '/verify-code',
    {
      schema: {
        description: 'Verify a 6-digit code sent to the email',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'code'],
          properties: {
            email: { type: 'string', format: 'email' },
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              verified: { type: 'boolean' },
              token: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = verifyCodeSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const { email, code } = parsed.data;
      const result = await emailVerificationService.verifyCode(app.redis, email, code);
      void reply.send(result);
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
          required: ['email', 'password', 'verificationToken'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            timezone: { type: 'string' },
            locale: { type: 'string' },
            verificationToken: { type: 'string' },
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
      if (!parsed.success) throw parsed.error;

      // Validate verification token
      const verifiedEmail = await emailVerificationService.validateToken(
        app.redis,
        parsed.data.verificationToken,
      );
      if (!verifiedEmail || verifiedEmail !== parsed.data.email.toLowerCase()) {
        throw AppError.badRequest('VERIFICATION_INVALID', 'Email verification is required. Please verify your email first.');
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
          required: ['email', 'password', 'verificationToken'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            verificationToken: { type: 'string' },
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
      if (!parsed.success) throw parsed.error;

      // Validate verification token
      const verifiedEmail = await emailVerificationService.validateToken(
        app.redis,
        parsed.data.verificationToken,
      );
      if (!verifiedEmail || verifiedEmail !== parsed.data.email.toLowerCase()) {
        throw AppError.badRequest('VERIFICATION_INVALID', 'Email verification is required. Please verify your email first.');
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
      if (!parsed.success) throw parsed.error;

      const tokens = await authService.googleLogin(parsed.data);
      void reply.send(tokens);
    },
  );
}
