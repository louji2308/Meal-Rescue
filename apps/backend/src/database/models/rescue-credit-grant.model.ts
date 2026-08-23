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
 * One row per verified ad reward, keyed by a namespaced ad transaction id
 * (`credits:<id>` / `propass:<id>`). The UNIQUE constraint is what makes
 * grantCredits/grantProPass replay-proof: a second claim of the same ad
 * violates it and the service returns granted=false.
 */
export class RescueCreditGrant extends Model<
  InferAttributes<RescueCreditGrant, { omit: 'createdAt' }>,
  InferCreationAttributes<RescueCreditGrant, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare userId: UUID;
  declare adTransactionId: string;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineRescueCreditGrantModel(sequelize: Sequelize): typeof RescueCreditGrant {
  RescueCreditGrant.init(
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
      adTransactionId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
    },
    {
      sequelize,
      modelName: 'RescueCreditGrant',
      tableName: 'rescue_credit_grants',
      underscored: true,
      updatedAt: false,
    },
  );
  return RescueCreditGrant;
}
