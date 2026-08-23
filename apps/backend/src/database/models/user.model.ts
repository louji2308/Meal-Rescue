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
  /** Ad-earned extra rescues for today (Rescue Fuel). */
  declare rescueCredits: CreationOptional<number>;
  /** Temporary Pro window granted by a verified rewarded ad (Pro Pass). */
  declare proPassUntil: Date | null;
  /** Push quiet hours in LOCAL hours (0-23); null = defaults (22-8). */
  declare quietStartHour: number | null;
  declare quietEndHour: number | null;
  /** Client-reported UTC offset in minutes; anchors "local day" math. */
  declare tzOffsetMinutes: CreationOptional<number>;
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
      rescueCredits: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      proPassUntil: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      quietStartHour: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 0, max: 23 },
      },
      quietEndHour: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 0, max: 23 },
      },
      tzOffsetMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: -840, max: 840 },
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
