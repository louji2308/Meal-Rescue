import { Sequelize } from 'sequelize';

import { AdditionEvent, defineAdditionEventModel } from './addition-event.model';
import { DecisionEvent, defineDecisionEventModel } from './decision-event.model';
import { Feedback, defineFeedbackModel } from './feedback.model';
import { HouseholdMember, defineHouseholdMemberModel } from './household-member.model';
import { HouseholdPreference, defineHouseholdPreferenceModel } from './household-preference.model';
import { Household, defineHouseholdModel } from './household.model';
import {
  InventoryReservation,
  defineInventoryReservationModel,
} from './inventory-reservation.model';
import { MealEvent, defineMealEventModel } from './meal-event.model';
import {
  MealInventoryAllocation,
  defineMealInventoryAllocationModel,
} from './meal-inventory-allocation.model';
import { MealMemoryEvent, defineMealMemoryEventModel } from './meal-memory-event.model';
import { MealPlan, defineMealPlanModel } from './meal-plan.model';
import { MealRule, defineMealRuleModel } from './meal-rule.model';
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
import { SharedMealMember, defineSharedMealMemberModel } from './shared-meal-member.model';
import { SharedMeal, defineSharedMealModel } from './shared-meal.model';
import { TableEvent, defineTableEventModel } from './table-event.model';
import { TableOutcome, defineTableOutcomeModel } from './table-outcome.model';
import { TasteCombination, defineTasteCombinationModel } from './taste-combination.model';
import { TasteEvent, defineTasteEventModel } from './taste-event.model';
import { TasteExposure, defineTasteExposureModel } from './taste-exposure.model';
import { TasteMemory, defineTasteMemoryModel } from './taste-memory.model';
import {
  TasteSensoryPreference,
  defineTasteSensoryPreferenceModel,
} from './taste-sensory-preference.model';
import {
  TasteTreatmentPreference,
  defineTasteTreatmentPreferenceModel,
} from './taste-treatment-preference.model';
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
  TasteEvent: typeof TasteEvent;
  TasteExposure: typeof TasteExposure;
  TasteCombination: typeof TasteCombination;
  TasteSensoryPreference: typeof TasteSensoryPreference;
  TasteTreatmentPreference: typeof TasteTreatmentPreference;
  AdditionEvent: typeof AdditionEvent;
  SatisfactionRecord: typeof SatisfactionRecordModel;
  DecisionEvent: typeof DecisionEvent;
  Household: typeof Household;
  HouseholdMember: typeof HouseholdMember;
  HouseholdPreference: typeof HouseholdPreference;
  SharedMeal: typeof SharedMeal;
  SharedMealMember: typeof SharedMealMember;
  TableOutcome: typeof TableOutcome;
  TableEvent: typeof TableEvent;
  MealMemoryEvent: typeof MealMemoryEvent;
  MealPlan: typeof MealPlan;
  MealEvent: typeof MealEvent;
  MealRule: typeof MealRule;
  InventoryReservation: typeof InventoryReservation;
  MealInventoryAllocation: typeof MealInventoryAllocation;
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
    TasteEvent: defineTasteEventModel(sequelize),
    TasteExposure: defineTasteExposureModel(sequelize),
    TasteCombination: defineTasteCombinationModel(sequelize),
    TasteSensoryPreference: defineTasteSensoryPreferenceModel(sequelize),
    TasteTreatmentPreference: defineTasteTreatmentPreferenceModel(sequelize),
    AdditionEvent: defineAdditionEventModel(sequelize),
    SatisfactionRecord: defineSatisfactionRecordModel(sequelize),
    DecisionEvent: defineDecisionEventModel(sequelize),
    Household: defineHouseholdModel(sequelize),
    HouseholdMember: defineHouseholdMemberModel(sequelize),
    HouseholdPreference: defineHouseholdPreferenceModel(sequelize),
    SharedMeal: defineSharedMealModel(sequelize),
    SharedMealMember: defineSharedMealMemberModel(sequelize),
    TableOutcome: defineTableOutcomeModel(sequelize),
    TableEvent: defineTableEventModel(sequelize),
    MealMemoryEvent: defineMealMemoryEventModel(sequelize),
    MealPlan: defineMealPlanModel(sequelize),
    MealEvent: defineMealEventModel(sequelize),
    MealRule: defineMealRuleModel(sequelize),
    InventoryReservation: defineInventoryReservationModel(sequelize),
    MealInventoryAllocation: defineMealInventoryAllocationModel(sequelize),
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

  models.User.hasMany(models.TasteEvent, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteEvent.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.TasteExposure, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteExposure.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.TasteCombination, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteCombination.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.TasteSensoryPreference, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteSensoryPreference.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });

  models.User.hasMany(models.TasteTreatmentPreference, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.TasteTreatmentPreference.belongsTo(models.User, {
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

  // --- Common Table associations ---
  models.User.hasMany(models.Household, { foreignKey: { name: 'ownerId', allowNull: false } });
  models.Household.belongsTo(models.User, { foreignKey: { name: 'ownerId', allowNull: false } });

  models.Household.hasMany(models.HouseholdMember, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.HouseholdMember.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });

  models.HouseholdMember.hasMany(models.HouseholdPreference, {
    foreignKey: { name: 'memberId', allowNull: false },
  });
  models.HouseholdPreference.belongsTo(models.HouseholdMember, {
    foreignKey: { name: 'memberId', allowNull: false },
  });

  models.User.hasMany(models.SharedMeal, { foreignKey: { name: 'ownerId', allowNull: false } });
  models.SharedMeal.belongsTo(models.User, { foreignKey: { name: 'ownerId', allowNull: false } });
  models.Household.hasMany(models.SharedMeal, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.SharedMeal.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });

  models.SharedMeal.hasMany(models.SharedMealMember, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });
  models.SharedMealMember.belongsTo(models.SharedMeal, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });
  models.HouseholdMember.hasMany(models.SharedMealMember, {
    foreignKey: { name: 'memberId', allowNull: false },
  });
  models.SharedMealMember.belongsTo(models.HouseholdMember, {
    foreignKey: { name: 'memberId', allowNull: false },
  });

  models.SharedMeal.hasMany(models.TableOutcome, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });
  models.TableOutcome.belongsTo(models.SharedMeal, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });

  models.SharedMeal.hasMany(models.TableEvent, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });
  models.TableEvent.belongsTo(models.SharedMeal, {
    foreignKey: { name: 'sharedMealId', allowNull: false },
  });

  // --- Meal Memory associations ---
  models.User.hasMany(models.MealMemoryEvent, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.MealMemoryEvent.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.Household.hasMany(models.MealMemoryEvent, {
    foreignKey: { name: 'householdId', allowNull: true },
  });
  models.MealMemoryEvent.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: true },
  });

  models.User.hasMany(models.MealPlan, { foreignKey: { name: 'ownerId', allowNull: false } });
  models.MealPlan.belongsTo(models.User, { foreignKey: { name: 'ownerId', allowNull: false } });
  models.Household.hasMany(models.MealPlan, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealPlan.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });

  models.User.hasMany(models.MealEvent, { foreignKey: { name: 'userId', allowNull: false } });
  models.MealEvent.belongsTo(models.User, { foreignKey: { name: 'userId', allowNull: false } });
  models.Household.hasMany(models.MealEvent, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealEvent.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealPlan.hasMany(models.MealEvent, {
    foreignKey: { name: 'planId', allowNull: true },
  });
  models.MealEvent.belongsTo(models.MealPlan, {
    foreignKey: { name: 'planId', allowNull: true },
  });

  models.Household.hasMany(models.MealRule, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealRule.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.HouseholdMember.hasMany(models.MealRule, {
    foreignKey: { name: 'memberId', allowNull: true },
  });
  models.MealRule.belongsTo(models.HouseholdMember, {
    foreignKey: { name: 'memberId', allowNull: true },
  });

  models.Household.hasMany(models.InventoryReservation, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.InventoryReservation.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealEvent.hasMany(models.InventoryReservation, {
    foreignKey: { name: 'mealEventId', allowNull: true },
  });
  models.InventoryReservation.belongsTo(models.MealEvent, {
    foreignKey: { name: 'mealEventId', allowNull: true },
  });

  models.Household.hasMany(models.MealInventoryAllocation, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealInventoryAllocation.belongsTo(models.Household, {
    foreignKey: { name: 'householdId', allowNull: false },
  });
  models.MealEvent.hasMany(models.MealInventoryAllocation, {
    foreignKey: { name: 'mealEventId', allowNull: false },
  });
  models.MealInventoryAllocation.belongsTo(models.MealEvent, {
    foreignKey: { name: 'mealEventId', allowNull: false },
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
  TasteEvent,
  TasteExposure,
  TasteCombination,
  TasteSensoryPreference,
  TasteTreatmentPreference,
  AdditionEvent,
  SatisfactionRecord: SatisfactionRecordModel,
  DecisionEvent,
  Household,
  HouseholdMember,
  HouseholdPreference,
  SharedMeal,
  SharedMealMember,
  TableOutcome,
  TableEvent,
  MealMemoryEvent,
  MealPlan,
  MealEvent,
  MealRule,
  InventoryReservation,
  MealInventoryAllocation,
};
