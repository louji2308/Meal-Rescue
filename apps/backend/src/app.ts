import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import Fastify, { FastifyInstance } from 'fastify';

import { env } from './config/env';
import { authHook } from './middleware/auth';
import { registerErrorHandler } from './middleware/error-handler';
import { authRoutes } from './modules/auth/auth.routes';
import redisPlugin from './plugins/redis';
import { adsRoutes } from './routes/ads.routes';
import { aftercareRoutes } from './routes/aftercare.routes';
import { aiPlannerRoutes } from './routes/ai-planner.routes';
import { aiRescueRoutes } from './routes/ai-rescue.routes';
import { commonTableRoutes } from './routes/common-table.routes';
import { decisionRoutes } from './routes/decision.routes';
import { feedbackRoutes } from './routes/feedback.routes';
import { householdRoutes } from './routes/household.routes';
import { kitchenRoutes } from './routes/kitchen.routes';
import { leftoverRoutes } from './routes/leftover.routes';
import { mealMemoryRoutes } from './routes/meal-memory.routes';
import { mealRoutes } from './routes/meal.routes';
import { notificationRoutes } from './routes/notification.routes';
import { pantryRoutes } from './routes/pantry.routes';
import { paywallRoutes } from './routes/paywall.routes';
import { planReviewRoutes } from './routes/plan-review.routes';
import { rescueRoutes } from './routes/rescue.routes';
import { satisfactionRoutes } from './routes/satisfaction.routes';
import { subscriptionRoutes } from './routes/subscription.routes';
import { tasteJournalRoutes } from './routes/taste-journal.routes';
import { userRoutes } from './routes/user.routes';
import { webhookRoutes } from './routes/webhook.routes';

/**
 * Global JSON body ceiling. Exported so the 413 security-contract test can
 * exceed exactly this value instead of hardcoding one (they drifted once
 * already and the test started passing a payload Fastify happily accepted).
 */
export const BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB — matches multipart fileSize limit

/**
 * Builds the Fastify application. Deliberately free of side effects:
 * no database connection, no port binding. `server.ts` owns startup;
 * tests call buildApp() and use fastify.inject().
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'warn' : env.LOG_LEVEL,
      base: { service: 'meal-rescue-api' },
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    // SECURITY: Disable detailed HTTP error responses in production.
    // Prevents Fastify from sending full stack traces or error objects.
    disableRequestLogging: false,
    bodyLimit: BODY_LIMIT_BYTES,
    // SECURITY: Do not expose Node.js version in X-Powered-By header.
    // helmet() handles this, but belt-and-suspenders.
    http2: false,
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
  });

  await app.register(helmet, {
    // SECURITY: API-only CSP; but enable HSTS, X-Frame-Options, etc.
    contentSecurityPolicy: false,
    // Force HTTPS in production (HSTS)
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    // Prevent MIME type sniffing
    noSniff: true,
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // XSS Protection header (legacy browsers)
    xssFilter: true,
    // Referrer policy — don't leak auth tokens in referer headers
    referrerPolicy: { policy: 'no-referrer' },
  });

  // Redis first so downstream plugins (rate-limit) can use it.
  await app.register(redisPlugin);

  // Meal photo uploads (Phase 2). Size enforced per-file in the route;
  // attachFieldsToBody stays off so JSON routes are unaffected.
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis: app.redis?.status === 'ready' ? app.redis : undefined,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Meal Rescue API',
        description:
          'AI-powered meal optimization. The rescue pipeline is deterministic-first: ' +
          'LLMs rank and explain, they never decide alone.',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
  });

  // --- Hooks ---
  app.addHook('onRequest', authHook);
  registerErrorHandler(app);

  // --- Routes ---
  app.get(
    '/health',
    {
      schema: {
        description: 'Liveness probe — returns ok when the process is running',
        tags: ['system'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  );

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(mealRoutes, { prefix: '/api/v1/meal' });
  await app.register(rescueRoutes, { prefix: '/api/v1/rescue' });
  await app.register(decisionRoutes, { prefix: '/api/v1/rescue' });
  await app.register(feedbackRoutes, { prefix: '/api/v1/rescue' });
  await app.register(satisfactionRoutes, { prefix: '/api/v1/rescue' });
  await app.register(aftercareRoutes, { prefix: '/api/v1/rescue' });
  await app.register(pantryRoutes, { prefix: '/api/v1/pantry' });
  await app.register(userRoutes, { prefix: '/api/v1/user' });
  await app.register(tasteJournalRoutes, { prefix: '/api/v1/user/taste-journal' });
  await app.register(leftoverRoutes, { prefix: '/api/v1/leftover' });
  await app.register(kitchenRoutes, { prefix: '/api/v1/kitchen' });
  await app.register(adsRoutes, { prefix: '/api/v1/ads' });
  await app.register(aiRescueRoutes);
  await app.register(paywallRoutes);
  await app.register(subscriptionRoutes, { prefix: '/api/v1' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(webhookRoutes, { prefix: '/api/v1' });
  await app.register(householdRoutes, { prefix: '/api/v1/households' });
  await app.register(commonTableRoutes, { prefix: '/api/v1/common-table' });
  await app.register(mealMemoryRoutes, { prefix: '/api/v1/meal-memory' });
  await app.register(planReviewRoutes, { prefix: '/api/v1/meal-memory' });
  await app.register(aiPlannerRoutes, { prefix: '/api/v1/meal-memory' });

  return app;
}
