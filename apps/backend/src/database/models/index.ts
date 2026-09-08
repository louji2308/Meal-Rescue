import { Sequelize } from 'sequelize';

import { AdditionEvent, defineAdditionEventModel } from './addition-event.model';
import { DecisionEvent, defineDecisionEventModel } from './decision-event.model';
import { Feedback, defineFeedbackModel } from './feedback.model';
import { Meal, defineMealModel } from './meal.model';
import { NotificationLog, defineNotificationLogModel } from './notification-log.model';
import { Pantry, definePantryModel } from './pantry.model';
import { Preference, definePreferenceModel } from './preference.model';
import { RescueCreditGrant, defineRescueCreditGrantModel } from './rescue-credit-grant.model';
import { Rescue, defineRescueModel } from './rescue.model';
import {
  SatisfactionRecordModel,
  defineSatisfactionRecordModel,
} from './satisfaction-record.model';
import { TasteMemory, defineTasteMemoryModel } from './taste-memory.model';
import { User, defineUserModel } from './user.model';

export interface DbModels {
  User: typeof User;
  Meal: typeof Meal;
  Rescue: typeof Rescue;
  Feedback: typeof Feedback;
  Preference: typeof Preference;
  Pantry: typeof Pantry;
  RescueCreditGrant: typeof RescueCreditGrant;
  NotificationLog: typeof NotificationLog;
  TasteMemory: typeof TasteMemory;
  AdditionEvent: typeof AdditionEvent;
  SatisfactionRecord: typeof SatisfactionRecordModel;
  DecisionEvent: typeof DecisionEvent;
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
    RescueCreditGrant: defineRescueCreditGrantModel(sequelize),
    NotificationLog: defineNotificationLogModel(sequelize),
    TasteMemory: defineTasteMemoryModel(sequelize),
    AdditionEvent: defineAdditionEventModel(sequelize),
    SatisfactionRecord: defineSatisfactionRecordModel(sequelize),
    DecisionEvent: defineDecisionEventModel(sequelize),
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

  models.User.hasMany(models.NotificationLog, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.NotificationLog.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.TasteMemory, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteMemory.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.AdditionEvent, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.AdditionEvent.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.SatisfactionRecord, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.SatisfactionRecord.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.Rescue.hasMany(models.SatisfactionRecord, {
    foreignKey: { name: 'rescueId', allowNull: false },
  });
  models.SatisfactionRecord.belongsTo(models.Rescue, {
    foreignKey: { name: 'rescueId', allowNull: false },
  });

  models.User.hasMany(models.DecisionEvent, {
    foreignKey: { name: 'userId', allowNull: true },
  });
  models.DecisionEvent.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: true },
  });

  return models;
}

export const dbModels = {
  User,
  Meal,
  Rescue,
  Feedback,
  Preference,
  Pantry,
  RescueCreditGrant,
  NotificationLog,
  TasteMemory,
  AdditionEvent,
  SatisfactionRecord: SatisfactionRecordModel,
  DecisionEvent,
};
