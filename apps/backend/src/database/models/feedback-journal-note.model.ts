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
 * feedback_journal_notes - the editorial note written from a rescue
 * feedback submission (the feedback -> taste journal loop).
 *
 * One row per (user, strand): a newer note for the same strand REPLACES the
 * older one, which is exactly the "AI edits your taste memory" behaviour -
 * the journal shows the latest reading of that strand, not a diary pile-up.
 */
export class FeedbackJournalNote extends Model<
  InferAttributes<FeedbackJournalNote>,
  InferCreationAttributes<FeedbackJournalNote>
> {
  declare id: CreationOptional<UUID>;
  declare userId: UUID;
  declare rescueId: UUID | null;
  /** Strand the note attaches to, e.g. "STRAND:ingredient:spring onion". */
  declare strandKey: string;
  declare title: string;
  declare body: string;
  declare polarity: 'positive' | 'negative' | 'neutral';
  declare source: 'ai' | 'fallback';
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineFeedbackJournalNoteModel(sequelize: Sequelize): typeof FeedbackJournalNote {
  FeedbackJournalNote.init(
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
      rescueId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'rescues', key: 'id' },
        onDelete: 'SET NULL',
      },
      strandKey: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      title: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      polarity: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'neutral',
      },
      source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'ai',
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
      modelName: 'FeedbackJournalNote',
      tableName: 'feedback_journal_notes',
      underscored: true,
    },
  );
  return FeedbackJournalNote;
}
