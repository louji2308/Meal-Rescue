import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { User } from '../src/database/models/user.model';
import { PantryService } from '../src/services/pantry.service';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const describeDb = hasDb ? describe : describe.skip;

let pantry: PantryService;

describeDb('pantry leftovers', () => {
  beforeAll(async () => {
    const db = await initializeDatabase();
    await sequelize.sync({ force: true });
    pantry = new PantryService(db.models);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedUser() {
    return User.create({
      id: randomUUID(),
      email: `leftover-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: 'free',
      rescueCredits: 0,
      locale: 'en-US',
      tzOffsetMinutes: 0,
    });
  }

  it('stores leftovers with dish metadata and mirrors the name', async () => {
    const user = await seedUser();

    const item = await pantry.upsertItem(user.id, {
      ingredientName: 'Chicken Biryani',
      kind: 'leftover',
      dishName: 'Chicken Biryani',
      servings: 3,
      notes: 'spicy, reheat well',
      madeAt: new Date().toISOString(),
    });

    expect(item.kind).toBe('leftover');
    expect(item.dishName).toBe('Chicken Biryani');
    expect(item.servings).toBe(3);
    expect(item.notes).toBe('spicy, reheat well');
    expect(item.madeAt).not.toBeNull();

    const pantryItems = await pantry.getPantry(user.id);
    const saved = pantryItems.ingredients.find((i) => i.id === item.id);
    expect(saved?.kind).toBe('leftover');
    expect(saved?.servings).toBe(3);
    expect(saved?.isLowStock).toBe(false);
  });

  it('re-upserting the same leftover dish updates the row instead of duplicating', async () => {
    const user = await seedUser();

    await pantry.upsertItem(user.id, {
      ingredientName: 'Beef Stew',
      kind: 'leftover',
      dishName: 'Beef Stew',
      servings: 2,
    });
    const updated = await pantry.upsertItem(user.id, {
      ingredientName: 'Beef Stew',
      kind: 'leftover',
      dishName: 'Beef Stew',
      servings: 5,
    });

    const pantryItems = await pantry.getPantry(user.id);
    const matches = pantryItems.ingredients.filter((i) => i.ingredientName === 'Beef Stew');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.servings).toBe(5);
    expect(updated.servings).toBe(5);
  });

  it('markUsed decrements servings and deletes when the last serving is eaten', async () => {
    const user = await seedUser();

    const dish = await pantry.upsertItem(user.id, {
      ingredientName: 'Pasta Alfredo',
      kind: 'leftover',
      dishName: 'Pasta Alfredo',
      servings: 2,
    });

    await pantry.markUsed(user.id, 'Pasta Alfredo');
    let pantryItems = await pantry.getPantry(user.id);
    let saved = pantryItems.ingredients.find((i) => i.id === dish.id);
    expect(saved?.servings).toBe(1);

    await pantry.markUsed(user.id, 'Pasta Alfredo');
    pantryItems = await pantry.getPantry(user.id);
    saved = pantryItems.ingredients.find((i) => i.id === dish.id);
    expect(saved).toBeUndefined();
  });

  it('regular pantry items never report as low stock', async () => {
    const user = await seedUser();

    const item = await pantry.upsertItem(user.id, {
      ingredientName: 'chicken',
      quantity: 0.5,
      unit: 'kg',
    });

    expect(item.isLowStock).toBe(false);

    const pantryItems = await pantry.getPantry(user.id);
    expect(pantryItems.ingredients.find((i) => i.id === item.id)?.isLowStock).toBe(false);
    expect(pantryItems.lowStock).toHaveLength(0);
  });

  it('markUsed still decrements quantity for regular pantry items', async () => {
    const user = await seedUser();

    const item = await pantry.upsertItem(user.id, {
      ingredientName: 'eggs',
      quantity: 6,
      unit: 'pcs',
    });

    await pantry.markUsed(user.id, 'eggs');

    const pantryItems = await pantry.getPantry(user.id);
    expect(pantryItems.ingredients.find((i) => i.id === item.id)?.quantity).toBe(5);
  });
});