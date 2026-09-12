import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { MealFinish, UUID } from '@meal-rescue/shared-types';

export type FinishResultStatus = 'pending' | 'applied' | 'skipped' | 'swapped';

/**
 * Which member's finish was applied/skipped/swapped during the split moment.
 * One row per (shared_meal, member). `finish` duplicates the member's plan
 * snapshot so the cooking screen works offline after convergence.
 */
export class SharedMealMember extends Model<
  InferAttributes<SharedMealMember>,
  InferCreationAttributes<SharedMealMember>
> {
  declare id: CreationOptional<UUID>;
  declare sharedMealId: UUID;
  declare memberId: UUID;
  declare memberName: string;
  declare role: string | null;
  declare finish: MealFinish | null;
  declare status: CreationOptional<FinishResultStatus>;
  declare swappedTo: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineSharedMealMemberModel(sequelize: Sequelize): typeof SharedMealMember {
  SharedMealMember.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      sharedMealId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'shared_meals', key: 'id' },
        onDelete: 'CASCADE',
      },
      memberId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'household_members', key: 'id' },
        onDelete: 'CASCADE',
      },
      memberName: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      finish: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      swappedTo: {
        type: DataTypes.STRING(120),
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
      modelName: 'SharedMealMember',
      tableName: 'shared_meal_members',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_shared_meal_members_meal_member',
          fields: ['shared_meal_id', 'member_id'],
        },
      ],
    },
  );
  return SharedMealMember;
}
