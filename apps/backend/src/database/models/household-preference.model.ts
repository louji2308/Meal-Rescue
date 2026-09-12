import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

/**
 * Household preferences — a thin learning layer above the member profiles.
 * Affinity is -1..1; positive values mean the household shared table
 * converges well on this ingredient. `timestamps:false` mirrors taste
 * belief tables; `lastObservedAt` is maintained manually.
 */
export class HouseholdPreference extends Model<
  InferAttributes<HouseholdPreference>,
  InferCreationAttributes<HouseholdPreference>
> {
  declare id: CreationOptional<UUID>;
  declare memberId: UUID;
  declare ingredient: string;
  declare affinity: number;
  declare confidence: number;
  declare observationCount: number;
  declare lastObservedAt: Date;
}

export function defineHouseholdPreferenceModel(sequelize: Sequelize): typeof HouseholdPreference {
  HouseholdPreference.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      memberId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'household_members', key: 'id' },
        onDelete: 'CASCADE',
      },
      ingredient: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      affinity: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      lastObservedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'HouseholdPreference',
      tableName: 'household_preferences',
      underscored: true,
      timestamps: false,
      indexes: [
        {
          unique: true,
          name: 'uq_household_preferences_member_ingredient',
          fields: ['member_id', 'ingredient'],
        },
      ],
    },
  );
  return HouseholdPreference;
}
