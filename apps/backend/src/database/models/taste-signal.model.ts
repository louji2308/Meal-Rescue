import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

const DIMENSIONS = [
  'cuisine',
  'cuisine_style',
  'ingredient',
  'flavor',
  'texture',
  'temperature',
  'intensity',
  'treatment',
  'role',
] as const;

const SOURCES = ['ONBOARDING', 'BEHAVIOR', 'EXPLICIT_FEEDBACK', 'SYSTEM_INFERENCE'] as const;

const STATUSES = [
  'UNKNOWN',
  'EMERGING',
  'ESTABLISHED',
  'CONTEXTUAL',
  'CONFLICTED',
  'EXPLICIT',
  'DISMISSED',
] as const;

const POLARITIES = ['positive', 'negative', 'mixed', 'neutral'] as const;

/**
 * taste_signals - the journal's evidence store.
 *
 * Each row is one (dimension, value) strand for a user, e.g. "flavor: tangy".
 * Every insight in the Taste Journal is computed from these rows - one row,
 * never fabricated. Counts are additive; `sourceEventIds` keeps the projection
 * idempotent so backfills and replays never double-count.
 */
export class TasteSignal extends Model<
  InferAttributes<TasteSignal>,
  InferCreationAttributes<TasteSignal>
> {
  declare id: CreationOptional<UUID>;
  declare userId: UUID;
  declare dimension: (typeof DIMENSIONS)[number];
  declare value: string;
  declare polarity: (typeof POLARITIES)[number];
  declare status: (typeof STATUSES)[number];
  declare confidence: number;
  declare evidenceCount: number;
  declare positiveCount: number;
  declare negativeCount: number;
  declare neutralCount: number;
  declare sourceTypes: (typeof SOURCES)[number][];
  declare primarySourceType: (typeof SOURCES)[number];
  declare contexts: Array<{
    contextType: string;
    contextValue: string;
    count: number;
    share: number;
    polarity: (typeof POLARITIES)[number];
  }> | null;
  declare sourceEventIds: string[] | null;
  declare firstObservedAt: CreationOptional<Date>;
  declare lastObservedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteSignalModel(sequelize: Sequelize): typeof TasteSignal {
  TasteSignal.init(
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
      dimension: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: { isIn: [DIMENSIONS] },
      },
      value: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      polarity: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'neutral',
        validate: { isIn: [POLARITIES] },
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'UNKNOWN',
        validate: { isIn: [STATUSES] },
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      evidenceCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      positiveCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      negativeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      neutralCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      sourceTypes: {
        type: DataTypes.ARRAY(DataTypes.STRING(25)),
        allowNull: false,
        defaultValue: [],
      },
      primarySourceType: {
        type: DataTypes.STRING(25),
        allowNull: false,
        defaultValue: 'BEHAVIOR',
      },
      contexts: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      sourceEventIds: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      firstObservedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      lastObservedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteSignal',
      tableName: 'taste_signals',
      underscored: true,
      indexes: [
        {
          name: 'idx_taste_signals_user_dim_value',
          fields: ['user_id', 'dimension', 'value'],
          unique: true,
        },
        { name: 'idx_taste_signals_user_status', fields: ['user_id', 'status'] },
        { name: 'idx_taste_signals_last_observed', fields: ['user_id', 'last_observed_at'] },
      ],
    },
  );
  return TasteSignal;
}