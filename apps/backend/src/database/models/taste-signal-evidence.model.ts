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
 * taste_signal_evidence - one attributable datum behind a signal strand.
 *
 * The journal only ever asserts things it can back with these rows. Each piece
 * records its source, polarity, optional originating event, observed context,
 * and timestamp - enough to power the "Why do you think this?" screen without
 * ever inventing detail. Deduped by (signal_id, source_event_key).
 */
export class TasteSignalEvidence extends Model<
  InferAttributes<TasteSignalEvidence>,
  InferCreationAttributes<TasteSignalEvidence>
> {
  declare id: CreationOptional<UUID>;
  declare signalId: UUID;
  declare userId: UUID;
  declare dimension: string;
  declare value: string;
  declare polarity: 'positive' | 'negative' | 'neutral';
  declare source: 'ONBOARDING' | 'BEHAVIOR' | 'EXPLICIT_FEEDBACK' | 'SYSTEM_INFERENCE';
  declare sourceLabel: string;
  /** Effective contribution weight (source weight x event weight factor). */
  declare weight: number;
  declare eventId: string | null;
  declare sourceEventKey: string;
  declare contextType: string | null;
  declare contextValue: string | null;
  declare note: string | null;
  declare occurredAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteSignalEvidenceModel(sequelize: Sequelize): typeof TasteSignalEvidence {
  TasteSignalEvidence.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      signalId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'taste_signals', key: 'id' },
        onDelete: 'CASCADE',
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
      },
      value: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      polarity: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['positive', 'negative', 'neutral']] },
      },
      source: {
        type: DataTypes.STRING(25),
        allowNull: false,
        validate: {
          isIn: [['ONBOARDING', 'BEHAVIOR', 'EXPLICIT_FEEDBACK', 'SYSTEM_INFERENCE']],
        },
      },
      sourceLabel: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      weight: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 1,
      },
      eventId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      sourceEventKey: {
        type: DataTypes.STRING(120),
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
      note: {
        type: DataTypes.STRING(300),
        allowNull: true,
      },
      occurredAt: {
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
      modelName: 'TasteSignalEvidence',
      tableName: 'taste_signal_evidence',
      underscored: true,
      indexes: [
        {
          name: 'idx_signal_evidence_signal_key',
          fields: ['signal_id', 'source_event_key'],
          unique: true,
        },
        { name: 'idx_signal_evidence_user_value', fields: ['user_id', 'dimension', 'value'] },
        { name: 'idx_signal_evidence_occurred', fields: ['occurred_at'] },
      ],
    },
  );
  return TasteSignalEvidence;
}