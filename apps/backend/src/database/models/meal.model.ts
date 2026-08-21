import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { InputType, UUID } from '@meal-rescue/shared-types';

/** Meals table - one analysis per capture (image, text, or voice). */
export class Meal extends Model<
  InferAttributes<Meal, { omit: 'createdAt' }>,
  InferCreationAttributes<Meal, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare userId: UUID;
  declare originalInput: string;
  declare inputType: InputType;
  declare detectedFoods: object;
  declare detectedIngredients: object;
  declare detectedComponents: object;
  declare confidenceScores: object | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineMealModel(sequelize: Sequelize): typeof Meal {
  Meal.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      originalInput: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      inputType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['image', 'text', 'voice']] },
      },
      detectedFoods: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      detectedIngredients: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      detectedComponents: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      confidenceScores: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Meal',
      tableName: 'meals',
      underscored: true,
      updatedAt: false,
    },
  );
  return Meal;
}
