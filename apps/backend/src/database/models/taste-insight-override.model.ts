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
 * taste_insight_overrides - user corrections to journal insights.
 *
 * When someone taps "That's not me", "Actually I love X" or "Forget this",
 * we record it here WITHOUT rewriting history. The journal re-renders the
 * affected insight through the latest override. Dismissals and corrections
 * are last-write-wins per (userId, insightKey).
 */
export class TasteInsightOverride extends Model<
  InferAttributes<TasteInsightOverride>,
  InferCreationAttributes<TasteInsightOverride>
> {
  declare id: CreationOptional<UUID>;
  declare userId: UUID;
  declare insightKey: string;
  declare action: 'DISMISSED' | 'CORRECTED' | 'FORGOTTEN';
  declare note: string | null;
  declare correctedPolarity: 'positive' | 'negative' | null;
  declare correctedValue: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineTasteInsightOverrideModel(
  sequelize: Sequelize,
): typeof TasteInsightOverride {
  TasteInsightOverride.init(
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
      insightKey: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
      action: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['DISMISSED', 'CORRECTED', 'FORGOTTEN']] },
      },
      note: {
        type: DataTypes.STRING(300),
        allowNull: true,
      },
      correctedPolarity: {
        type: DataTypes.STRING(10),
        allowNull: true,
        validate: { isIn: [['positive', 'negative']] },
      },
      correctedValue: {
        type: DataTypes.STRING(100),
        allowNull: true,
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
      modelName: 'TasteInsightOverride',
      tableName: 'taste_insight_overrides',
      underscored: true,
      indexes: [
        {
          name: 'idx_insight_overrides_user_key',
          fields: ['user_id', 'insight_key'],
          unique: true,
        },
        { name: 'idx_insight_overrides_user_action', fields: ['user_id', 'action'] },
      ],
    },
  );
  return TasteInsightOverride;
}