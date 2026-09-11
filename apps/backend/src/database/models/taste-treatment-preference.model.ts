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
 * taste_treatment_preferences - user treatment preferences per ingredient.
 * Derived from MEAL_COMPLETED + SATISFACTION events.
 */
export class TasteTreatmentPreference extends Model<
  InferAttributes<TasteTreatmentPreference>,
  InferCreationAttributes<TasteTreatmentPreference>
> {
  declare id: UUID;
  declare userId: UUID;
  declare ingredient: string;
  declare treatment: string;
  declare preference: string;
  declare strength: number;
  declare sourceEventId: CreationOptional<UUID | null>;
  declare sampleCount: number;
  declare lastConfirmedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteTreatmentPreferenceModel(sequelize: Sequelize): typeof TasteTreatmentPreference {
  TasteTreatmentPreference.init(
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
      treatment: {
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
      tableName: 'taste_treatment_preferences',
      timestamps: true,
      underscored: true,
    },
  );

  return TasteTreatmentPreference;
}
