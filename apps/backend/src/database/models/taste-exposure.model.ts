import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { UUID } from '@meal-rescue/shared-types';

/**
 * taste_exposure - tracks recent exposure to prevent repetition.
 * Separate from beliefs: exposure never changes preference by itself,
 * it affects candidate ranking.
 */
export class TasteExposure extends Model<
  InferAttributes<TasteExposure>,
  InferCreationAttributes<TasteExposure>
> {
  declare id: UUID;
  declare userId: UUID;
  declare targetType: string;
  declare targetId: string;
  declare recentRecommendations: number;
  declare recentCompletions: number;
  declare lastRecommendedAt: CreationOptional<Date | null>;
  declare lastCompletedAt: CreationOptional<Date | null>;
  declare consecutiveExposure: number;
  declare windowStart: CreationOptional<Date>;
}

export function defineTasteExposureModel(sequelize: Sequelize): typeof TasteExposure {
  TasteExposure.init(
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
      targetType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      recentRecommendations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      recentCompletions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastRecommendedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastCompletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      consecutiveExposure: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      windowStart: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteExposure',
      tableName: 'taste_exposure',
      underscored: true,
      timestamps: false,
      indexes: [
        {
          unique: true,
          name: 'uq_taste_exposure_user_target',
          fields: ['user_id', 'target_type', 'target_id'],
        },
      ],
    },
  );
  return TasteExposure;
}
