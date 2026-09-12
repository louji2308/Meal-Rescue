import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { MealRuleInstructionType, MealSlot } from '@meal-rescue/shared-types';

/**
 * meal_rules — explicit user rules and reservations ("don't use eggs this
 * week", "save the chicken for Sunday", "keep Friday open"). These sit
 * above learned preferences in the memory priority hierarchy and must be
 * honored by every planning operation.
 */
export class MealRule extends Model<InferAttributes<MealRule>, InferCreationAttributes<MealRule>> {
  declare id: CreationOptional<string>;
  declare householdId: string;
  declare memberId: string | null;
  declare userId: string;
  declare scope: string;
  declare instructionType: MealRuleInstructionType;
  declare ingredient: string | null;
  declare mealSlot: MealSlot | null;
  declare detail: Record<string, unknown> | null;
  declare priorityGroup: number;
  declare active: boolean;
  declare appliesFrom: string | null;
  declare expiresAt: string | null;
  declare note: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineMealRuleModel(sequelize: Sequelize): typeof MealRule {
  MealRule.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      memberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'household_members', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      scope: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'household',
        validate: { isIn: [['household', 'member', 'user']] },
      },
      instructionType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          isIn: [
            [
              'EXCLUDE_INGREDIENT',
              'HOLD_INGREDIENT',
              'RESERVE_INGREDIENT',
              'BLOCK_SLOT',
              'KEEP_OPEN',
              'KEEP_OUT',
              'AVAILABILITY',
              'EFFORT',
              'PREFERENCE',
              'RECURRENCE',
              'GENERAL',
            ],
          ],
        },
      },
      ingredient: { type: DataTypes.STRING(160), allowNull: true },
      mealSlot: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: [['breakfast', 'lunch', 'dinner', 'snack']] },
      },
      detail: { type: DataTypes.JSONB, allowNull: true },
      priorityGroup: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        validate: { min: 2, max: 7 },
      },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      appliesFrom: { type: DataTypes.DATEONLY, allowNull: true },
      expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'MealRule',
      tableName: 'meal_rules',
      underscored: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_meal_rules_household_active', fields: ['household_id', 'active'] },
        { name: 'idx_meal_rules_ingredient', fields: ['ingredient'] },
      ],
    },
  );

  return MealRule;
}
