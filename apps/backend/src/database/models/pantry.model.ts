import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Op,
  Sequelize,
} from 'sequelize';

import { UUID } from '@meal-rescue/shared-types';

/**
 * Pantry table - what the user currently has at home.
 * `usePriority` > 0 nudges the engine to prefer using that ingredient sooner.
 */
export class Pantry extends Model<InferAttributes<Pantry>, InferCreationAttributes<Pantry>> {
  declare id: UUID;
  declare userId: UUID;
  declare ingredientName: string;
  declare quantity: number | null;
  declare unit: string | null;
  declare addedAt: CreationOptional<Date>;
  declare expiresAt: Date | null;
  declare lastUsedAt: Date | null;
  declare usePriority: number;
}

export function definePantryModel(sequelize: Sequelize): typeof Pantry {
  Pantry.init(
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
      ingredientName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      addedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      usePriority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'Pantry',
      tableName: 'pantries',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_pantries_user_ingredient',
          fields: ['user_id', 'ingredient_name'],
        },
        // Partial index mirroring the architecture doc
        {
          name: 'idx_pantry_expires_soon',
          fields: ['user_id', 'expires_at'],
          where: { expires_at: { [Op.ne]: null } },
        },
      ],
    },
  );
  return Pantry;
}
