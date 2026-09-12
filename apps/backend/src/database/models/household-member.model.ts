import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import type {
  HouseholdMemberConstraints,
  HouseholdMemberSoftPreferences,
  HouseholdRelationship,
  UUID,
} from '@meal-rescue/shared-types';

/**
 * Household members — lightweight profiles that do NOT require accounts.
 * HARD constraints (allergies, dietary restrictions, avoid list) live in
 * `constraints` (JSONB) and are enforced fail-closed before any ranking.
 */
export class HouseholdMember extends Model<
  InferAttributes<HouseholdMember>,
  InferCreationAttributes<HouseholdMember>
> {
  declare id: UUID;
  declare householdId: UUID;
  declare displayName: string;
  declare initials: string;
  declare relationship: HouseholdRelationship;
  declare isOwner: CreationOptional<boolean>;
  declare active: CreationOptional<boolean>;
  declare constraints: HouseholdMemberConstraints;
  declare preferences: HouseholdMemberSoftPreferences;
  declare createdAt: CreationOptional<Date>;
}

export function defineHouseholdMemberModel(sequelize: Sequelize): typeof HouseholdMember {
  HouseholdMember.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      displayName: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      initials: {
        type: DataTypes.STRING(4),
        allowNull: false,
      },
      relationship: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'other',
      },
      isOwner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      constraints: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { allergies: [], dietaryRestrictions: [], avoidIngredients: [] },
      },
      preferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          likes: [],
          dislikes: [],
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'HouseholdMember',
      tableName: 'household_members',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_household_members_household',
          fields: ['household_id'],
        },
      ],
    },
  );
  return HouseholdMember;
}
