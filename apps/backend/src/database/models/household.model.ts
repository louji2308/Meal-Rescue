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
 * Households — a lightweight group concept owned by one user. Members are
 * lightweight profiles (no accounts); the owner is auto-created as the
 * first (isOwner) member.
 */
export class Household extends Model<
  InferAttributes<Household>,
  InferCreationAttributes<Household>
> {
  declare id: UUID;
  declare ownerId: UUID;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
}

export function defineHouseholdModel(sequelize: Sequelize): typeof Household {
  Household.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        defaultValue: 'Our Table',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Household',
      tableName: 'households',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_households_owner',
          fields: ['owner_id'],
        },
      ],
    },
  );
  return Household;
}
