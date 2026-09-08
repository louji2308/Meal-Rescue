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
 * V2 Satisfaction Record - explicit "did that hit the spot?" feedback per rescue.
 *
 * One row per rescue; the API enforces idempotency (only one record per rescue).
 * The personalization pipeline reads these as higher-weight signals than passive
 * history (plan §8).
 */
export class SatisfactionRecordModel extends Model<
  InferAttributes<SatisfactionRecordModel, { omit: 'createdAt' }>,
  InferCreationAttributes<SatisfactionRecordModel, { omit: 'createdAt' }>
> {
  declare id: UUID;
  declare rescueId: UUID;
  declare userId: UUID;
  declare result: 'EXACTLY' | 'ALMOST' | 'NOT_REALLY';
  declare reason: string[] | null;
  declare readonly createdAt: CreationOptional<Date>;
}

export function defineSatisfactionRecordModel(
  sequelize: Sequelize,
): typeof SatisfactionRecordModel {
  SatisfactionRecordModel.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      rescueId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'rescues', key: 'id' },
        onDelete: 'CASCADE',
        unique: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      result: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['EXACTLY', 'ALMOST', 'NOT_REALLY']] },
      },
      reason: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SatisfactionRecord',
      tableName: 'satisfaction_records',
      underscored: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_satisfaction_rescue', fields: ['rescue_id'], unique: true },
        { name: 'idx_satisfaction_user', fields: ['user_id'] },
      ],
    },
  );
  return SatisfactionRecordModel;
}
