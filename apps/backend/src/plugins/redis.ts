import { FastifyInstance } from 'fastify';
import FastifyPlugin from 'fastify-plugin';
import Redis from 'ioredis';

import { env } from '../config/env';

/**
 * Redis decorator with graceful degradation.
 *
 * The architecture doc requires the API to keep serving when the cache is
 * down ("Pantry lookup fails -> assume not available"). So connection
 * failures are logged, never fatal. Phase 2 services consume app.redis.
 */
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis | null;
  }
}

export default FastifyPlugin(async function redisPlugin(app: FastifyInstance): Promise<void> {
  if (env.REDIS_DISABLED || env.NODE_ENV === 'test') {
    app.decorate('redis', null);
    return;
  }

  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  client.on('error', (err) => {
    // Prevent unhandled error crashes; degradation handled by consumers.
    app.log.warn({ err: err.message }, 'Redis error - continuing without cache');
  });

  try {
    await client.connect();
    app.log.info('Redis connected');
  } catch (err) {
    app.log.warn({ err }, 'Redis unavailable at boot - running without cache');
  }

  app.decorate('redis', client);

  app.addHook('onClose', async () => {
    if (client.status !== 'end') {
      await client.quit().catch(() => client.disconnect());
    }
  });
});
