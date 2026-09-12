import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type { UUID } from '@meal-rescue/shared-types';

export type TableRating = 'loved' | 'worked' | 'not_really';

export interface TableMemberOutcome {
  memberId: UUID;
  rating: TableRating;
  notes?: string;
}

export interface TableFinishResult {
  memberId: UUID;
  status: 'applied' | 'skipped' | 'swapped';
  swappedTo?: string;
}

/**
 * Table outcomes — "How did dinner go?" + "What should we remember?".
 * Drives HouseholdPreference learning (shared successes reinforce affinity).
 */
export class TableOutcome extends Model<
  InferAttributes<TableOutcome>,
  InferCreationAttributes<TableOutcome>
> {
  declare id: CreationOptional<UUID>;
  declare sharedMealId: UUID;
  declare submittedBy: UUID;
  declare householdRating: TableRating;
  declare remember: string | null;
  declare memberOutcomes: TableMemberOutcome[] | null;
  declare finishResults: TableFinishResult[] | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineTableOutcomeModel(sequelize: Sequelize): typeof TableOutcome {
  TableOutcome.init(
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
      submittedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      householdRating: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      remember: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      memberOutcomes: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      finishResults: {
        type: DataTypes.JSONB,
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
      modelName: 'TableOutcome',
      tableName: 'table_outcomes',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_table_outcomes_shared_meal',
          fields: ['shared_meal_id'],
        },
        {
          name: 'idx_table_outcomes_submitted_by',
          fields: ['submitted_by'],
        },
      ],
    },
  );
  return TableOutcome;
}
