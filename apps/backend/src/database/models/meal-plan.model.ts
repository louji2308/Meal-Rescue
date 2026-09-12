import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

/**
 * meal_plans — a coherent plan group covering one week (Monday-Sunday).
 *
 * A weekly plan is one row; its meals live in meal_events keyed by
 * plan_id. Replanning supersedes the previous plan instead of rewriting
 * history, so PLAN memory never collides with REALITY memory.
 */
export class MealPlan extends Model<InferAttributes<MealPlan>, InferCreationAttributes<MealPlan>> {
  declare id: CreationOptional<string>;
  declare householdId: string;
  declare ownerId: string;
  declare status: string;
  declare weekStart: string;
  declare source: string;
  declare createdAt: CreationOptional<Date>;
}

export function defineMealPlanModel(sequelize: Sequelize): typeof MealPlan {
  MealPlan.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'proposed',
        validate: { isIn: [['proposed', 'confirmed', 'declined', 'superseded']] },
      },
      weekStart: { type: DataTypes.DATEONLY, allowNull: false },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
        validate: {
          isIn: [['plan_week', 'schedule', 'replan', 'intent', 'manual']],
        },
      },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'MealPlan',
      tableName: 'meal_plans',
      underscored: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_meal_plans_household_week', fields: ['household_id', 'week_start'] },
        { name: 'idx_meal_plans_owner', fields: ['owner_id'] },
      ],
    },
  );

  return MealPlan;
}
