import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Op,
  Sequelize,
} from 'sequelize';

import type { MealRole, MealSlot } from '@meal-rescue/shared-types';

/**
 * meal_events — the Meal Memory calendar (INTENT + PLAN + REALITY).
 *
 * One row per (household, date, slot, kind); kind separates the planned
 * meal from the actual meal so history is never overwritten. State tracks
 * the lifecycle (PLANNED→CONFIRMED→EATEN/SKIPPED/REPLACED/MOVED/...),
 * slot_status tracks flexibility (LOCKED/PREFERRED/OPEN/FLEXIBLE/BLOCKED/
 * OUT/UNKNOWN). The partial unique index guarantees one plan row and one
 * actual row per slot while still allowing flexible rows with a NULL date.
 */
export class MealEvent extends Model<
  InferAttributes<MealEvent>,
  InferCreationAttributes<MealEvent>
> {
  declare id: CreationOptional<string>;
  declare householdId: string;
  declare planId: string | null;
  declare userId: string;
  declare dateKey: string | null;
  declare mealSlot: MealSlot;
  declare kind: string;
  declare concept: string | null;
  declare conceptType: string | null;
  declare state: string;
  declare slotStatus: string;
  declare flexible: boolean;
  declare horizon: string | null;
  declare excludedDays: string[] | null;
  declare preferredDays: string[] | null;
  declare mealRole: MealRole | null;
  declare ingredients: string[] | null;
  declare memberIds: string[] | null;
  declare reasons: string[] | null;
  declare effort: string | null;
  declare rawText: string | null;
  declare movedFrom: Record<string, string> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineMealEventModel(sequelize: Sequelize): typeof MealEvent {
  MealEvent.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      planId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'meal_plans', key: 'id' },
        onDelete: 'SET NULL',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      dateKey: { type: DataTypes.DATEONLY, allowNull: true },
      mealSlot: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['breakfast', 'lunch', 'dinner', 'snack']] },
      },
      kind: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'plan',
        validate: { isIn: [['plan', 'actual']] },
      },
      concept: { type: DataTypes.STRING(160), allowNull: true },
      conceptType: {
        type: DataTypes.STRING(30),
        allowNull: true,
        validate: {
          isIn: [['recipe', 'leftover', 'eat_out', 'open', 'blocked', 'flexible', 'custom']],
        },
      },
      state: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PLANNED',
        validate: {
          isIn: [
            [
              'PLANNED',
              'CONFIRMED',
              'EATEN',
              'SKIPPED',
              'REPLACED',
              'CANCELLED',
              'MOVED',
              'OPEN',
              'BLOCKED',
              'OUT',
            ],
          ],
        },
      },
      slotStatus: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'OPEN',
        validate: {
          isIn: [['LOCKED', 'PREFERRED', 'OPEN', 'FLEXIBLE', 'BLOCKED', 'OUT', 'UNKNOWN']],
        },
      },
      flexible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      horizon: { type: DataTypes.STRING(30), allowNull: true },
      excludedDays: { type: DataTypes.JSONB, allowNull: true },
      preferredDays: { type: DataTypes.JSONB, allowNull: true },
      mealRole: {
        type: DataTypes.STRING(30),
        allowNull: true,
        validate: {
          isIn: [
            [
              'USE_SOON',
              'LEFTOVER',
              'LOW_EFFORT',
              'FAMILY_FAVORITE',
              'VARIETY',
              'COMFORT',
              'EXPLORE',
              'BALANCE',
              'INVENTORY_UTILIZATION',
            ],
          ],
        },
      },
      ingredients: { type: DataTypes.JSONB, allowNull: true },
      memberIds: { type: DataTypes.JSONB, allowNull: true },
      reasons: { type: DataTypes.JSONB, allowNull: true },
      effort: {
        type: DataTypes.STRING(10),
        allowNull: true,
        validate: { isIn: [['low', 'medium', 'high']] },
      },
      rawText: { type: DataTypes.TEXT, allowNull: true },
      movedFrom: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'MealEvent',
      tableName: 'meal_events',
      underscored: true,
      indexes: [
        {
          // One plan row + one actual row per firm slot. Flexible slots have a
          // NULL date and are deduped at the service layer.
          name: 'uq_meal_events_firm_slot',
          unique: true,
          fields: ['household_id', 'date_key', 'meal_slot', 'kind'],
          where: { date_key: { [Op.ne]: null } },
        },
        { name: 'idx_meal_events_household_date', fields: ['household_id', 'date_key'] },
        { name: 'idx_meal_events_household_plan', fields: ['household_id', 'plan_id'] },
        { name: 'idx_meal_events_user', fields: ['user_id'] },
      ],
    },
  );

  return MealEvent;
}
