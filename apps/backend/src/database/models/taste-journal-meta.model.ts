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
 * taste_journal_meta - marks that a user's historical data has been backfilled
 * into taste_signals. One row per user; backfill is idempotent regardless
 * (evidence carries dedupe keys), this just stops re-scanning on every read.
 */
export class TasteJournalMeta extends Model<
  InferAttributes<TasteJournalMeta>,
  InferCreationAttributes<TasteJournalMeta>
> {
  declare userId: UUID;
  declare backfilledAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteJournalMetaModel(sequelize: Sequelize): typeof TasteJournalMeta {
  TasteJournalMeta.init(
    {
      userId: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      backfilledAt: {
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
      modelName: 'TasteJournalMeta',
      tableName: 'taste_journal_meta',
      underscored: true,
    },
  );
  return TasteJournalMeta;
}