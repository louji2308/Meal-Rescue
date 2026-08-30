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
 * addition_events - one row per onboarding answer (and later, per real-world
 * completion behavior). Feeds the meal x addition compatibility learning
 * phase. An UNAVAILABLE row is NOT a negative preference - it records "not
 * tested", never "disliked".
 */
export class AdditionEvent extends Model<
  InferAttributes<AdditionEvent>,
  InferCreationAttributes<AdditionEvent>
> {
  declare id: UUID;
  declare userId: UUID;
  declare pairId: string;
  declare baseMealName: string;
  declare baseMealGroup: string;
  declare cuisineLabel: string;
  declare additionA: string;
  declare additionB: string;
  declare selected: string | null;
  declare state: string;
  declare rejectionReason: string | null;
  declare unavailableOption: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineAdditionEventModel(sequelize: Sequelize): typeof AdditionEvent {
  AdditionEvent.init(
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
      pairId: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      baseMealName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      baseMealGroup: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      cuisineLabel: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      additionA: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      additionB: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      selected: {
        type: DataTypes.STRING(1),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      rejectionReason: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      unavailableOption: {
        type: DataTypes.STRING(1),
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
      modelName: 'AdditionEvent',
      tableName: 'addition_events',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_addition_events_user_created',
          fields: ['user_id', 'created_at'],
        },
      ],
    },
  );
  return AdditionEvent;
}
