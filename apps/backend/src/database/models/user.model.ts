import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { SubscriptionTier, UUID } from '@meal-rescue/shared-types';

/**
 * Users table - matches the architecture doc schema.
 *
 * `passwordHash` is a Phase 1 addition: until the Firebase project is
 * provisioned, local email+password auth issues the JWTs. The column is
 * nullable so Firebase-only accounts (no local password) are representable.
 */
export class User extends Model<
  InferAttributes<User, { omit: 'createdAt' }>,
  InferCreationAttributes<User, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare email: string;
  declare passwordHash: string | null;
  declare subscriptionTier: SubscriptionTier;
  declare subscriptionExpiresAt: Date | null;
  declare timezone: string | null;
  declare locale: string;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      subscriptionTier: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'free',
        validate: { isIn: [['free', 'pro']] },
      },
      subscriptionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      timezone: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      locale: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'en-US',
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      underscored: true,
      updatedAt: false,
    },
  );
  return User;
}
