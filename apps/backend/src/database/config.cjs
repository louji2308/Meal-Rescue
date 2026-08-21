'use strict';

/**
 * sequelize-cli configuration (reads env, never hardcodes credentials).
 * Used by `npm run db:migrate` - see .sequelizerc for paths.
 */

require('dotenv').config();

module.exports = {
  development: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://meal_rescue:local_password@localhost:5432/meal_rescue_dev',
    dialect: 'postgres',
    logging: false,
  },
  test: {
    url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: false,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: false,
  },
};
