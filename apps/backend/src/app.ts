import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import Fastify, { FastifyInstance } from 'fastify';

import { env } from './config/env';
import { authHook } from './middleware/auth';
import { registerErrorHandler } from './middleware/error-handler';
import { authRoutes } from './modules/auth/auth.routes';
import redisPlugin from './plugins/redis';
import { feedbackRoutes } from './routes/feedback.routes';
import { mealRoutes } from './routes/meal.routes';
import { pantryRoutes } from './routes/pantry.routes';
import { rescueRoutes } from './routes/rescue.routes';
import { userRoutes } from './routes/user.routes';

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
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // API only; revisit if we serve HTML
  });

  // Redis first so downstream plugins (rate-limit) can use it.
  await app.register(redisPlugin);

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis: app.redis ?? undefined,
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
        description: 'Liveness probe with dependency status',
        tags: ['system'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              uptimeSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(mealRoutes, { prefix: '/api/v1/meal' });
  await app.register(rescueRoutes, { prefix: '/api/v1/rescue' });
  await app.register(feedbackRoutes, { prefix: '/api/v1/feedback' });
  await app.register(pantryRoutes, { prefix: '/api/v1/pantry' });
  await app.register(userRoutes, { prefix: '/api/v1/user' });

  return app;
}
