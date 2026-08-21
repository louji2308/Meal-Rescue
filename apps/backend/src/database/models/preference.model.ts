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
 * Preferences table - learned user preferences with confidence tracking.
 * Rows are upserted as the learning system observes behavior (Phase 4).
 */
export class Preference extends Model<
  InferAttributes<Preference>,
  InferCreationAttributes<Preference>
> {
  declare id: UUID;
  declare userId: UUID;
  declare preferenceType: string;
  declare preferenceKey: string;
  declare preferenceValue: object;
  declare confidenceScore: number;
  declare observationCount: number;
  declare lastUpdated: CreationOptional<Date>;
}

export function definePreferenceModel(sequelize: Sequelize): typeof Preference {
  Preference.init(
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
      preferenceType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      preferenceKey: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      preferenceValue: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      confidenceScore: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Preference',
      tableName: 'preferences',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_preferences_user_type_key',
          fields: ['user_id', 'preference_type', 'preference_key'],
        },
      ],
    },
  );
  return Preference;
}
