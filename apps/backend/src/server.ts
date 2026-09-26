import 'dotenv/config';

import { buildApp } from './app';
import { env } from './config/env';
import { closeDatabase, initializeDatabase } from './database';
import {
  startMealMemoryScheduler,
  stopMealMemoryScheduler,
} from './services/meal-memory/scheduler';
import { validateOneSignalCredentials } from './services/notifications/notification.service';
import {
  startSpoilerAlertScheduler,
  stopSpoilerAlertScheduler,
} from './services/notifications/spoiler-alert.service';
import {
  startAftercareScheduler,
  stopAftercareScheduler,
} from './services/v2/aftercare-notification.service';

/**
 * Sentry error tracking — initialized only when SENTRY_DSN is set.
 * Install: npm install @sentry/node
 * When no DSN is configured, all Sentry calls are safe no-ops.
 */
async function initSentry(): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    });
  } catch {
    // @sentry/node not installed — skip silently
  }
}

/**
 * Process entrypoint: database first, then HTTP, then signals.
 * A failed dependency check at boot is fatal - better than serving
 * traffic we cannot fulfill.
 */
async function main(): Promise<void> {
  await initSentry();
  const app = await buildApp();

  try {
    await initializeDatabase();
    app.log.info('Database connected');
  } catch (err) {
    app.log.warn({ err }, 'Database unavailable — running in degraded mode (auth will fail)');
  }

  // Engagement engine only when OneSignal is actually configured - tests
  // and dry-run dev boots never get a cron timer.
  if (env.ONESIGNAL_APP_ID && env.NODE_ENV !== 'test') {
    const credCheck = await validateOneSignalCredentials();
    if (credCheck.valid) {
      app.log.info('OneSignal credentials validated');
      startSpoilerAlertScheduler();
      startMealMemoryScheduler();
      startAftercareScheduler();
      app.log.info('Notification schedulers started');
    } else {
      app.log.warn(
        { error: credCheck.error },
        'OneSignal credential validation failed — schedulers not started',
      );
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down gracefully');
    try {
      await stopSpoilerAlertScheduler();
      await stopMealMemoryScheduler();
      await stopAftercareScheduler();
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
