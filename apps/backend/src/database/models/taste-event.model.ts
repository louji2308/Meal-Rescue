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
 * taste_events - immutable event log.
 * Every taste signal originates here. Events are never updated or deleted.
 * Beliefs are derived aggregates computed from events.
 */
export class TasteEvent extends Model<
  InferAttributes<TasteEvent>,
  InferCreationAttributes<TasteEvent>
> {
  declare id: UUID;
  declare userId: UUID;
  declare eventType: string;
  declare targetType: string;
  declare targetId: string;
  declare contextKey: string;
  declare contextType: CreationOptional<string | null>;
  declare contextValue: CreationOptional<string | null>;
  declare treatment: CreationOptional<string | null>;
  declare role: CreationOptional<string | null>;
  declare magnitude: CreationOptional<string | null>;
  declare sourceStrength: number;
  declare attributionConfidence: number;
  declare rescueId: CreationOptional<UUID | null>;
  declare mealId: CreationOptional<UUID | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
}

export function defineTasteEventModel(sequelize: Sequelize): typeof TasteEvent {
  TasteEvent.init(
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
      eventType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextKey: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextType: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      contextValue: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      treatment: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      magnitude: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      sourceStrength: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      attributionConfidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      rescueId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'rescues', key: 'id' },
      },
      mealId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'meals', key: 'id' },
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteEvent',
      tableName: 'taste_events',
      underscored: true,
      timestamps: false,
      indexes: [
        { name: 'idx_taste_events_user', fields: ['user_id'] },
        { name: 'idx_taste_events_user_type', fields: ['user_id', 'event_type'] },
        { name: 'idx_taste_events_user_target', fields: ['user_id', 'target_type', 'target_id'] },
        { name: 'idx_taste_events_created', fields: ['created_at'] },
      ],
    },
  );
  return TasteEvent;
}
