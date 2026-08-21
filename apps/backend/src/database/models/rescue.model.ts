import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { Satisfaction, UUID, UserDecision } from '@meal-rescue/shared-types';

/**
 * Rescues table - THE first-class object of the product.
 *
 * A rescue records the full pipeline run: original meal, constraints,
 * generated candidates, the selected recommendation, the user's decision
 * and the eventual outcome. This is what enables real learning.
 *
 * `userDecision` uses 'pending' until the user acts; the architecture SQL
 * declares the column NOT NULL, so pending is materialized as a default
 * rather than allowing NULLs.
 */
export class Rescue extends Model<
  InferAttributes<Rescue, { omit: 'createdAt' }>,
  InferCreationAttributes<Rescue, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare mealId: UUID;
  declare userId: UUID;
  declare originalMeal: object;
  declare detectedIngredients: object;
  declare constraints: object;
  declare candidatesGenerated: object;
  declare selectedRecommendation: object;
  declare reasoning: string;
  declare userDecision: UserDecision | 'pending';
  declare decisionTimestamp: Date | null;
  declare outcome: object | null;
  declare satisfactionFeedback: Satisfaction | null;
  declare feedbackText: string | null;
  declare feedbackTimestamp: Date | null;
  declare processingTimeMs: number | null;
  declare modelVersion: string | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineRescueModel(sequelize: Sequelize): typeof Rescue {
  Rescue.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      mealId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'meals', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      originalMeal: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      detectedIngredients: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      constraints: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      candidatesGenerated: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      selectedRecommendation: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      reasoning: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      userDecision: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'accepted', 'swapped', 'rejected', 'kept_as_is']],
        },
      },
      decisionTimestamp: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      outcome: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      satisfactionFeedback: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { isIn: [['better', 'same', 'not_for_me']] },
      },
      feedbackText: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      feedbackTimestamp: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      processingTimeMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      modelVersion: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Rescue',
      tableName: 'rescues',
      underscored: true,
      updatedAt: false,
      indexes: [
        // Critical indexes for personalization queries (architecture doc)
        { name: 'idx_rescues_user_satisfaction', fields: ['user_id', 'satisfaction_feedback'] },
        { name: 'idx_rescues_user_decision', fields: ['user_id', 'user_decision'] },
      ],
    },
  );
  return Rescue;
}
