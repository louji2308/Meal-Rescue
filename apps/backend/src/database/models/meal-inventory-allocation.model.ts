import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

/**
 * meal_inventory_allocations — planned usage of a kitchen quantity.
 *
 * The planner records how much of each important ingredient is allocated
 * to each planned meal so the agent understands temporal inventory: 12
 * eggs does NOT mean "use eggs everywhere", it means 2 → breakfast,
 * 2 → Thursday dinner, 2 → weekend, rest unallocated.
 */
export class MealInventoryAllocation extends Model<
  InferAttributes<MealInventoryAllocation>,
  InferCreationAttributes<MealInventoryAllocation>
> {
  declare id: CreationOptional<string>;
  declare householdId: string;
  declare mealEventId: string;
  declare ingredient: string;
  declare quantity: number | null;
  declare unit: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineMealInventoryAllocationModel(
  sequelize: Sequelize,
): typeof MealInventoryAllocation {
  MealInventoryAllocation.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      mealEventId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'meal_events', key: 'id' },
        onDelete: 'CASCADE',
      },
      ingredient: { type: DataTypes.STRING(160), allowNull: false },
      quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'MealInventoryAllocation',
      tableName: 'meal_inventory_allocations',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'uq_meal_inventory_allocations_event_ingredient',
          unique: true,
          fields: ['meal_event_id', 'ingredient'],
        },
        { name: 'idx_meal_inventory_allocations_household', fields: ['household_id'] },
      ],
    },
  );

  return MealInventoryAllocation;
}
