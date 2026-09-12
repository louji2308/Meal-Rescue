import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type {
  CommonTableStatus,
  CookingStep,
  EffortLevel,
  MealFinish,
  SharedMealPlan,
  UUID,
} from '@meal-rescue/shared-types';

/**
 * Shared meals — a converged Common Table session. The full plan is stored
 * as JSONB (sharedSteps/branchSteps/finishes) so the mobile client can
 * render the split point and individual finishes without re-computation.
 * `status` tracks the cooking lifecycle (planning → converged → cooking →
 * split → completed → failed).
 */
export class SharedMeal extends Model<
  InferAttributes<SharedMeal>,
  InferCreationAttributes<SharedMeal>
> {
  declare id: UUID;
  declare householdId: UUID;
  declare ownerId: UUID;
  declare status: CommonTableStatus;
  declare baseName: string | null;
  declare baseDescription: string | null;
  declare estimatedMinutes: number | null;
  declare effort: EffortLevel | null;
  declare equipment: string[] | null;
  declare splitPointIndex: number | null;
  declare sharedSteps: CookingStep[] | null;
  declare branchSteps: CookingStep[] | null;
  declare finishes: MealFinish[] | null;
  declare ingredients: string[] | null;
  declare blockedIngredients: string[] | null;
  declare survey: { fallback: { message: string; suggestions: string[] } | null } | null;
  declare completedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineSharedMealModel(sequelize: Sequelize): typeof SharedMeal {
  SharedMeal.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
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
        defaultValue: 'converged',
      },
      baseName: {
        type: DataTypes.STRING(160),
        allowNull: true,
      },
      baseDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      estimatedMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      effort: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      equipment: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
      splitPointIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      sharedSteps: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      branchSteps: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      finishes: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      ingredients: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      blockedIngredients: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      survey: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'SharedMeal',
      tableName: 'shared_meals',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_shared_meals_household_created',
          fields: ['household_id', 'created_at'],
        },
        {
          name: 'idx_shared_meals_owner',
          fields: ['owner_id'],
        },
        {
          name: 'idx_shared_meals_status',
          fields: ['status'],
        },
      ],
    },
  );
  return SharedMeal;
}

export type SharedMealRecord = SharedMeal;

export function toPlan(meal: SharedMeal): SharedMealPlan {
  return {
    baseName: meal.baseName ?? 'Shared meal',
    baseDescription: meal.baseDescription ?? '',
    estimatedMinutes: meal.estimatedMinutes ?? 0,
    effort: meal.effort ?? 'medium',
    equipment: meal.equipment ?? [],
    sharedSteps: meal.sharedSteps ?? [],
    splitPointIndex: meal.splitPointIndex ?? 0,
    branchSteps: meal.branchSteps ?? [],
    finishes: meal.finishes ?? [],
    ingredients: meal.ingredients ?? [],
    excludedIngredients: meal.blockedIngredients ?? [],
  };
}
