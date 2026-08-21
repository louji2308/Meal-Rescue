import { Sequelize } from 'sequelize';

import { Feedback, defineFeedbackModel } from './feedback.model';
import { Meal, defineMealModel } from './meal.model';
import { Pantry, definePantryModel } from './pantry.model';
import { Preference, definePreferenceModel } from './preference.model';
import { Rescue, defineRescueModel } from './rescue.model';
import { User, defineUserModel } from './user.model';

export interface DbModels {
  User: typeof User;
  Meal: typeof Meal;
  Rescue: typeof Rescue;
  Feedback: typeof Feedback;
  Preference: typeof Preference;
  Pantry: typeof Pantry;
}

export interface Db {
  sequelize: Sequelize;
  models: DbModels;
}

/**
 * Initializes all models and their associations.
 * Called once at startup (and once per test suite).
 */
export function initializeModels(sequelize: Sequelize): DbModels {
  const models: DbModels = {
    User: defineUserModel(sequelize),
    Meal: defineMealModel(sequelize),
    Rescue: defineRescueModel(sequelize),
    Feedback: defineFeedbackModel(sequelize),
    Preference: definePreferenceModel(sequelize),
    Pantry: definePantryModel(sequelize),
  };

  // --- Associations (implementation plan Step 1.2) ---
  models.User.hasMany(models.Meal, { foreignKey: { name: 'userId', allowNull: false } });
  models.Meal.belongsTo(models.User, { foreignKey: { name: 'userId', allowNull: false } });

  models.User.hasMany(models.Rescue, { foreignKey: { name: 'userId', allowNull: false } });
  models.Rescue.belongsTo(models.User, { foreignKey: { name: 'userId', allowNull: false } });

  models.Meal.hasMany(models.Rescue, { foreignKey: { name: 'mealId', allowNull: false } });
  models.Rescue.belongsTo(models.Meal, { foreignKey: { name: 'mealId', allowNull: false } });

  models.Rescue.hasMany(models.Feedback, {
    foreignKey: { name: 'rescueId', allowNull: false },
  });
  models.Feedback.belongsTo(models.Rescue, {
    foreignKey: { name: 'rescueId', allowNull: false },
  });

  models.User.hasMany(models.Feedback, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.Feedback.belongsTo(models.User, { foreignKey: { name: 'userId', allowNull: false } });

  models.User.hasMany(models.Preference, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.Preference.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.Pantry, { foreignKey: { name: 'userId', allowNull: false } });
  models.Pantry.belongsTo(models.User, { foreignKey: { name: 'userId', allowNull: false } });

  return models;
}

export const dbModels = { User, Meal, Rescue, Feedback, Preference, Pantry };
