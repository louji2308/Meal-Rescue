import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { UUID } from '@meal-rescue/shared-types';

/** Feedback table - typed feedback events attached to rescues. */
export class Feedback extends Model<
  InferAttributes<Feedback, { omit: 'createdAt' }>,
  InferCreationAttributes<Feedback, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare rescueId: UUID;
  declare userId: UUID;
  declare feedbackType: string;
  declare feedbackValue: object;
  declare context: object | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineFeedbackModel(sequelize: Sequelize): typeof Feedback {
  Feedback.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      rescueId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'rescues', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      feedbackType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      feedbackValue: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      context: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Feedback',
      tableName: 'feedback',
      underscored: true,
      updatedAt: false,
    },
  );
  return Feedback;
}
