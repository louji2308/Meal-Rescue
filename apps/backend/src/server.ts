import 'dotenv/config';

import { buildApp } from './app';
import { env } from './config/env';
import { closeDatabase, initializeDatabase } from './database';

/**
 * Process entrypoint: database first, then HTTP, then signals.
 * A failed dependency check at boot is fatal - better than serving
 * traffic we cannot fulfill.
 */
async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await initializeDatabase();
    app.log.info('Database connected');
  } catch (err) {
    app.log.error({ err }, 'Database connection failed at startup');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down gracefully');
    try {
      await app.close();
      await closeDatabase();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Meal Rescue API listening on :${env.PORT} (${env.NODE_ENV})`);
    app.log.info(`API docs available at http://localhost:${env.PORT}/docs`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start HTTP server');
    process.exit(1);
  }
}

void main();
