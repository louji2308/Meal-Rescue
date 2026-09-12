import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { MealMemoryIntent } from '@meal-rescue/shared-types';

/**
 * meal_memory_events — append-only log of natural-language interactions
 * with the Meal Memory agent. Each user request becomes one row; the
 * resolved intent, confidence, entities, and the resulting status are
 * kept so flows can be resumed (clarification) and audited (analytics).
 */
export class MealMemoryEvent extends Model<
  InferAttributes<MealMemoryEvent>,
  InferCreationAttributes<MealMemoryEvent>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare householdId: string | null;
  declare intent: MealMemoryIntent;
  declare confidence: number;
  declare rawText: string;
  declare entities: Record<string, unknown> | null;
  declare status: string;
  declare requiresClarification: boolean;
  declare clarificationQuestion: string | null;
  declare actionEventIds: string[] | null;
  declare error: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineMealMemoryEventModel(sequelize: Sequelize): typeof MealMemoryEvent {
  MealMemoryEvent.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      householdId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      intent: { type: DataTypes.STRING(40), allowNull: false },
      confidence: { type: DataTypes.DECIMAL(3, 2), allowNull: false },
      rawText: { type: DataTypes.TEXT, allowNull: false },
      entities: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'pending' },
      requiresClarification: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      clarificationQuestion: { type: DataTypes.TEXT, allowNull: true },
      actionEventIds: { type: DataTypes.JSONB, allowNull: true },
      error: { type: DataTypes.JSONB, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'MealMemoryEvent',
      tableName: 'meal_memory_events',
      underscored: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_meal_memory_events_user_created', fields: ['user_id', 'created_at'] },
        { name: 'idx_meal_memory_events_household', fields: ['household_id'] },
        { name: 'idx_meal_memory_events_intent', fields: ['intent'] },
      ],
    },
  );

  return MealMemoryEvent;
}
