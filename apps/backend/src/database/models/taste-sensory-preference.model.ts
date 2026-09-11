import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

import type { Sequelize } from 'sequelize';

/**
 * taste_sensory_preferences - user sensory preferences per ingredient per dimension.
 * Derived from MEAL_COMPLETED + SATISFACTION events.
 */
export class TasteSensoryPreference extends Model<
  InferAttributes<TasteSensoryPreference>,
  InferCreationAttributes<TasteSensoryPreference>
> {
  declare id: UUID;
  declare userId: UUID;
  declare ingredient: string;
  declare dimension: string;
  declare preference: string;
  declare strength: number;
  declare sourceEventId: CreationOptional<UUID | null>;
  declare sampleCount: number;
  declare lastConfirmedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteSensoryPreferenceModel(sequelize: Sequelize): typeof TasteSensoryPreference {
  TasteSensoryPreference.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      ingredient: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      dimension: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      preference: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      strength: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.5,
      },
      sourceEventId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      sampleCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      lastConfirmedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'taste_sensory_preferences',
      timestamps: true,
      underscored: true,
    },
  );

  return TasteSensoryPreference;
}
