import { Sequelize } from 'sequelize';

import { env } from '../config/env';
import { Db, initializeModels } from './models';

/**
 * Singleton Sequelize instance for the API process.
 * `initializeDatabase()` must be awaited before serving traffic.
 *
 * In test env, TEST_DATABASE_URL takes precedence so integration suites
 * can point at an isolated database (CI service container / embedded PG).
 */
const connectionString =
  env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL
    : env.DATABASE_URL;

export const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  // Dev-only SQL tracing; structured request logs come from Fastify/pino.
  logging:
    env.NODE_ENV === 'development'
      ? (sql) => {
          // eslint-disable-next-line no-console
          console.log(sql);
        }
      : false,
  pool: {
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    acquire: 30_000,
    idle: 10_000,
  },
});

let initialized = false;

/**
 * True once a live DB connection has been authenticated. When PostgreSQL is
 * unreachable the API still boots in degraded mode: models are bound so they
 * never crash with the opaque `reading 'constructor'` TypeError, and services
 * return hollow/empty data instead of 500ing (see HouseholdService /
 * MealMemoryService). Never trust this as a proxy for a future connection —
 * query errors are still caught where they happen.
 */
export let databaseReady = false;

export async function initializeDatabase(): Promise<Db> {
  if (initialized) {
    return { sequelize, models: sequelize.models as unknown as Db['models'] };
  }

  // Bind every model to the Sequelize instance BEFORE touching the network.
  // initializeModels only defines schema + associations in memory; it does not
  // require a live connection. Previously this ran after authenticate(), so a
  // missing database left every model uninitialized and every query threw
  // "Cannot read properties of undefined (reading 'constructor')".
  const models = initializeModels(sequelize);

  databaseReady = false;
  try {
    await sequelize.authenticate();
    // Auto-create/update tables from models.
    // TODO: Replace with proper migration runner when the schema stabilises.
    await sequelize.sync({ alter: true });
    databaseReady = true;
  } catch (err) {
    // Database unavailable — keep serving in degraded mode. Logged by the
    // caller (server.ts); services that need persistence fall back to
    // in-memory defaults keyed off databaseReady.
  }

  initialized = true;
  return { sequelize, models };
}

export function isDatabaseReady(): boolean {
  return databaseReady;
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
  initialized = false;
}
