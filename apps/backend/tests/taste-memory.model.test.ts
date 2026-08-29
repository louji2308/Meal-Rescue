import { DataTypes, Sequelize } from 'sequelize';

import { TasteMemory, defineTasteMemoryModel } from '../src/database/models/taste-memory.model';

describe('taste memory model', () => {
  let sequelize: Sequelize;
  let model: typeof TasteMemory;

  beforeEach(() => {
    // Dialect is only loaded at construction; `.init` builds metadata in
    // memory, so no live database is required for these assertions.
    sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', {
      logging: false,
    });
    model = defineTasteMemoryModel(sequelize);
  });

  it('defines the expected columns and unique index', () => {
    const attributes = model.getAttributes();
    expect(attributes.userId.type).toBeInstanceOf(DataTypes.UUID);
    expect(attributes.ingredient.type).toBeInstanceOf(DataTypes.STRING);
    expect(attributes.affinity.type).toBeInstanceOf(DataTypes.DECIMAL);
    expect(attributes.confidence.type).toBeInstanceOf(DataTypes.DECIMAL);
    expect(attributes.observationCount.type).toBeInstanceOf(DataTypes.INTEGER);

    const unique = model.options.indexes?.find((i: { unique?: boolean }) => i.unique);
    expect(unique).toBeDefined();
  });
});
