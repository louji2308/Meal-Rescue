import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { MealRescueEventType, UUID } from '@meal-rescue/shared-types';

/**
 * V2 Decision Event stream - backend-relevant product events (plan §27).
 *
 * Analysts, OneSignal, and the BuildInPublic evidence read from this table.
 * Only events the product actually uses are written (no over-instrumentation).
 */
export class DecisionEvent extends Model<
  InferAttributes<DecisionEvent, { omit: 'createdAt' }>,
  InferCreationAttributes<DecisionEvent, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare eventType: MealRescueEventType;
  declare userId: UUID | null;
  declare mealId: UUID | null;
  declare rescueId: UUID | null;
  declare payload: object | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineDecisionEventModel(sequelize: Sequelize): typeof DecisionEvent {
  DecisionEvent.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      eventType: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      mealId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      rescueId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'DecisionEvent',
      tableName: 'decision_events',
      underscored: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_decision_events_type', fields: ['event_type'] },
        { name: 'idx_decision_events_rescue', fields: ['rescue_id'] },
        { name: 'idx_decision_events_user', fields: ['user_id'] },
      ],
    },
  );
  return DecisionEvent;
}
