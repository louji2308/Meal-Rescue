import { DataTypes, Sequelize } from 'sequelize';

import { Pantry, definePantryModel } from '../src/database/models/pantry.model';

describe('pantry model', () => {
  let sequelize: Sequelize;
  let model: typeof Pantry;

  beforeEach(() => {
    sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', {
      logging: false,
    });
    model = definePantryModel(sequelize);
  });

  it('defines all expected columns including leftovers fields', () => {
    const attributes = model.getAttributes();

    expect(attributes.id.type).toBeInstanceOf(DataTypes.UUID);
    expect(attributes.userId.type).toBeInstanceOf(DataTypes.UUID);
    expect(attributes.ingredientName.type).toBeInstanceOf(DataTypes.STRING);
    expect(attributes.quantity.type).toBeInstanceOf(DataTypes.DECIMAL);
    expect(attributes.unit.type).toBeInstanceOf(DataTypes.STRING);
    expect(attributes.expiresAt.type).toBeInstanceOf(DataTypes.DATE);
    expect(attributes.lastUsedAt.type).toBeInstanceOf(DataTypes.DATE);
    expect(attributes.usePriority.type).toBeInstanceOf(DataTypes.INTEGER);

    const kind = attributes.kind;
    expect(kind).toBeDefined();
    expect(kind.type).toBeInstanceOf(DataTypes.STRING);
    expect(kind.defaultValue).toBe('pantry');

    const dishName = attributes.dishName;
    expect(dishName).toBeDefined();
    expect(dishName.allowNull).toBe(true);

    const servings = attributes.servings;
    expect(servings).toBeDefined();
    expect(servings.type).toBeInstanceOf(DataTypes.INTEGER);
    expect(servings.allowNull).toBe(true);

    const notes = attributes.notes;
    expect(notes).toBeDefined();
    expect(notes.type).toBeInstanceOf(DataTypes.TEXT);
    expect(notes.allowNull).toBe(true);

    const madeAt = attributes.madeAt;
    expect(madeAt).toBeDefined();
    expect(madeAt.type).toBeInstanceOf(DataTypes.DATE);
    expect(madeAt.allowNull).toBe(true);
  });

  it('retains the unique index on (user_id, ingredient_name)', () => {
    const indexes = model.options.indexes ?? [];
    const uniqueIndex = indexes.find((i: { unique?: boolean }) => i.unique);
    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex!.fields).toEqual(['user_id', 'ingredient_name']);
  });
});
