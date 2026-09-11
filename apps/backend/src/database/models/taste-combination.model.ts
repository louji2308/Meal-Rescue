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
 * taste_combinations - learns what ingredient pairs work for this person.
 * Not "egg = liked" + "noodles = liked" but "egg + noodles = successful".
 */
export class TasteCombination extends Model<
  InferAttributes<TasteCombination>,
  InferCreationAttributes<TasteCombination>
> {
  declare id: UUID;
  declare userId: UUID;
  declare members: string[];
  declare cuisineContext: CreationOptional<string | null>;
  declare mealContext: CreationOptional<string | null>;
  declare treatment: CreationOptional<string | null>;
  declare affinity: number;
  declare confidence: number;
  declare observationCount: number;
  declare lastObservedAt: Date;
}

export function defineTasteCombinationModel(sequelize: Sequelize): typeof TasteCombination {
  TasteCombination.init(
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
      members: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
      },
      cuisineContext: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      mealContext: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      treatment: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      affinity: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.3,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      lastObservedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteCombination',
      tableName: 'taste_combinations',
      underscored: true,
      timestamps: false,
      indexes: [
        { name: 'idx_taste_combinations_user', fields: ['user_id'] },
      ],
    },
  );
  return TasteCombination;
}
