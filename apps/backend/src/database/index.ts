import { Sequelize } from 'sequelize';

import { env } from '../config/env';
import { Db, initializeModels } from './models';

/**
 * Singleton Sequelize instance for the API process.
 * `initializeDatabase()` must be awaited before serving traffic.
 */
export const sequelize = new Sequelize(env.DATABASE_URL, {
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

export async function initializeDatabase(): Promise<Db> {
  if (initialized) {
    return { sequelize, models: sequelize.models as unknown as Db['models'] };
  }

  await sequelize.authenticate();

  const models = initializeModels(sequelize);

  // Dev convenience only - production uses migrations.
  if (env.NODE_ENV === 'development') {
    await sequelize.sync({ alter: true });
  }

  initialized = true;
  return { sequelize, models };
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
  initialized = false;
}
