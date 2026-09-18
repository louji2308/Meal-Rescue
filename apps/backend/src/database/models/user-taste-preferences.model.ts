import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

export interface StoredHardNos {
  allergies: string[];
  avoidIngredients: string[];
  dietaryRestrictions: string[];
  religiousCultural: string[];
  strongDislikes: string[];
}

export interface StoredTexturePreferences {
  crunchiness?: 'crunchy' | 'soft';
  creaminess?: 'creamy' | 'crisp';
  moistness?: 'juicy' | 'dry';
  chewiness?: 'chewy' | 'tender';
}

/**
 * user_taste_preferences - the user's own answers to the setup questions,
 * stored verbatim so they survive beyond being folded into taste signals.
 * `questions` keeps the exact copy the user answered against, so every
 * answer stays traceable to the question that produced it. One row per user.
 */
export class UserTastePreferences extends Model<
  InferAttributes<UserTastePreferences>,
  InferCreationAttributes<UserTastePreferences>
> {
  declare userId: UUID;
  declare hardNos: StoredHardNos;
  declare flavorPersonality: string[];
  declare texturePreferences: StoredTexturePreferences;
  declare adventurousness: string | null;
  declare rescueNeed: string[];
  declare priorities: string[];
  declare questions: Record<string, string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function defineUserTastePreferencesModel(sequelize: Sequelize): typeof UserTastePreferences {
  UserTastePreferences.init(
    {
      userId: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      hardNos: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          allergies: [],
          avoidIngredients: [],
          dietaryRestrictions: [],
          religiousCultural: [],
          strongDislikes: [],
        },
      },
      flavorPersonality: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      texturePreferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      adventurousness: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
      rescueNeed: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      priorities: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      questions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
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
      modelName: 'UserTastePreferences',
      tableName: 'user_taste_preferences',
      underscored: true,
    },
  );
  return UserTastePreferences;
}
