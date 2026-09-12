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
 * Table events — append-only observability log per shared meal
 * (common_table_started, convergence_generated, split_reached, completed,
 * feedback, failed). Mirrors the taste_events immutable-log philosophy.
 */
export class TableEvent extends Model<
  InferAttributes<TableEvent>,
  InferCreationAttributes<TableEvent>
> {
  declare id: CreationOptional<UUID>;
  declare sharedMealId: UUID;
  declare eventType: string;
  declare payload: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineTableEventModel(sequelize: Sequelize): typeof TableEvent {
  TableEvent.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      sharedMealId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shared_meals', key: 'id' },
        onDelete: 'CASCADE',
      },
      eventType: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      payload: {
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
      modelName: 'TableEvent',
      tableName: 'table_events',
      underscored: true,
      timestamps: false,
      indexes: [
        {
          name: 'idx_table_events_shared_meal_created',
          fields: ['shared_meal_id', 'created_at'],
        },
      ],
    },
  );
  return TableEvent;
}
