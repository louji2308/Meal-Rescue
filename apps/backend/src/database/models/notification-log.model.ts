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
 * Anti-fatigue ledger: one row per (user, notification kind, local day).
 *
 * The UNIQUE composite index is the dedupe primitive - markNotified()
 * inserts and relies on catching the constraint violation to detect
 * "already notified today". `suppressedUntil` implements snooze: while it
 * lies in the future, pushes of this kind are held off entirely.
 */
export class NotificationLog extends Model<
  InferAttributes<NotificationLog, { omit: 'createdAt' }>,
  InferCreationAttributes<NotificationLog, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare userId: UUID;
  /** Push category, e.g. 'rescue_window' | 'spoiler_alert' | 'generic'. */
  declare kind: string;
  /** User-local day key (YYYY-MM-DD) anchoring the once-per-day cap. */
  declare dayKey: string;
  declare readonly sentAt: CreationOptional<Date>;
  /** Set by snooze; suppresses further pushes of this kind until then. */
  declare suppressedUntil: Date | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineNotificationLogModel(sequelize: Sequelize): typeof NotificationLog {
  NotificationLog.init(
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
      kind: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      dayKey: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      suppressedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'NotificationLog',
      tableName: 'notification_logs',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_notification_dedupe',
          fields: ['user_id', 'kind', 'day_key'],
        },
      ],
    },
  );
  return NotificationLog;
}
