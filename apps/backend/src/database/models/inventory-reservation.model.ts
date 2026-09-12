import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

/**
 * inventory_reservations — explicit holds on kitchen quantities.
 *
 * "Don't use the eggs yet" and "save the chicken for Sunday" become
 * reservations: the planner subtracts the reserved quantity from what is
 * available, guaranteeing a HOLD is never consumed by a plan.
 */
export class InventoryReservation extends Model<
  InferAttributes<InventoryReservation>,
  InferCreationAttributes<InventoryReservation>
> {
  declare id: CreationOptional<string>;
  declare householdId: string;
  declare userId: string;
  declare ingredient: string;
  declare reservedQuantity: number | null;
  declare unit: string | null;
  declare purpose: string;
  declare mealEventId: string | null;
  declare active: boolean;
  declare expiresAt: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineInventoryReservationModel(sequelize: Sequelize): typeof InventoryReservation {
  InventoryReservation.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      householdId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'households', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      ingredient: { type: DataTypes.STRING(160), allowNull: false },
      reservedQuantity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      unit: { type: DataTypes.STRING(30), allowNull: true },
      purpose: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'HOLD',
        validate: { isIn: [['HOLD', 'RESERVE_MEAL', 'ALLOCATION']] },
      },
      mealEventId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'meal_events', key: 'id' },
        onDelete: 'SET NULL',
      },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'InventoryReservation',
      tableName: 'inventory_reservations',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_inventory_reservations_household_active',
          fields: ['household_id', 'active'],
        },
        { name: 'idx_inventory_reservations_ingredient', fields: ['ingredient'] },
      ],
    },
  );

  return InventoryReservation;
}
