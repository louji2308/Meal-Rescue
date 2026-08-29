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
 * taste_memories - per-context ingredient affinity.
 * Solve the "I avoid spice in curries but love it in tacos" problem:
 * affinity is tracked against a CONTEXT (cuisine / meal time / pattern),
 * never as a blanket per-ingredient score.
 */
export class TasteMemory extends Model<
  InferAttributes<TasteMemory>,
  InferCreationAttributes<TasteMemory>
> {
  declare id: UUID;
  declare userId: UUID;
  declare ingredient: string;
  declare contextType: string;
  declare contextValue: string;
  declare affinity: number; // -1.0 (avoid) .. +1.0 (love)
  declare confidence: number; // 0.0 .. 1.0
  declare observationCount: number;
  declare source: string; // 'feedback' | 'accept' | 'swap' | 'reject' | 'profile'
  declare lastUpdated: CreationOptional<Date>;
}

export type TasteMemoryContextType =
  'cuisine' | 'meal_time' | 'meal_pattern' | 'cuisine_family' | 'tradition_vs_modern' | 'global';

export function defineTasteMemoryModel(sequelize: Sequelize): typeof TasteMemory {
  TasteMemory.init(
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
      ingredient: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      contextValue: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      affinity: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteMemory',
      tableName: 'taste_memories',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_taste_memories_user_ctx',
          fields: ['user_id', 'ingredient', 'context_type', 'context_value'],
        },
      ],
    },
  );
  return TasteMemory;
}
