import { randomUUID } from 'node:crypto';

import { describe, expect, it } from '@jest/globals';

import { PantryService, canonicalizeIngredientName } from '../src/services/pantry.service';

// --- Minimal in-memory Sequelize stand-in for the Pantry model ------------
// PantryService touches: findAll, findOne, create, destroy on the model and
// get/get({plain})/update/destroy on instances. The fake mirrors the queries
// that matter (userId scoping, exact name, case-insensitive canonical lookup).

interface RowData {
  id: string;
  userId: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  addedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  usePriority: number;
  kind: 'pantry' | 'leftover';
  dishName: string | null;
  servings: number | null;
  notes: string | null;
  madeAt: Date | null;
}

type Where = Record<string, unknown>;

function ilikeValue(obj: Record<string, unknown>): string | null {
  const symbols = Object.getOwnPropertySymbols(obj);
  return symbols.length > 0 ? (obj as Record<symbol, string>)[symbols[0]!] ?? null : null;
}

class FakeStore {
  rows: RowData[] = [];

  private matches(row: RowData, where: Where): boolean {
    for (const key of Object.keys(where)) {
      const want = where[key];
      if (key === 'ingredientName') {
        const pattern = ilikeValue(want as Record<string, unknown>);
        if (pattern !== null) {
          if (row.ingredientName.toLowerCase() !== pattern.toLowerCase()) return false;
          continue;
        }
        if (row.ingredientName !== want) return false;
        continue;
      }
      if (row[key as keyof RowData] !== want) return false;
    }
    return true;
  }

  private instance(row: RowData) {
    const rows = this.rows;
    return {
      get(field?: string | { plain?: boolean }) {
        if (typeof field === 'string') return row[field as keyof RowData];
        if (field && typeof field === 'object' && field.plain) {
          return { ...row, addedAt: row.addedAt, expiresAt: row.expiresAt };
        }
        return row;
      },
      get quantity() { return row.quantity; },
      get kind() { return row.kind; },
      get servings() { return row.servings; },
      async update(updates: Record<string, unknown>) {
        Object.assign(row, updates);
        return this;
      },
      destroy() {
        const index = rows.indexOf(row);
        if (index >= 0) {
          rows.splice(index, 1);
          return 1;
        }
        return 0;
      },
    };
  }

  findAll({ where }: { where?: Where } = {}) {
    const filtered = where ? this.rows.filter((r) => this.matches(r, where)) : [...this.rows];
    return filtered.map((r) => this.instance(r));
  }

  findOne({ where }: { where: Where }) {
    const hit = this.rows.find((r) => this.matches(r, where));
    return hit ? this.instance(hit) : null;
  }

  create(data: Omit<RowData, 'addedAt' | 'usePriority'> & { addedAt?: Date; usePriority?: number }) {
    const row: RowData = {
      addedAt: new Date(),
      usePriority: 0,
      ...data,
    } as RowData;
    this.rows.push(row);
    return this.instance(row);
  }

  destroy({ where }: { where: Where }) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !this.matches(r, where));
    return before - this.rows.length;
  }
}

function makeService(store: FakeStore) {
  return new PantryService({ Pantry: store } as never);
}

describe('canonicalizeIngredientName', () => {
  it('maps case/colloquial variants of the same item to one canonical name', () => {
    expect(canonicalizeIngredientName('2% Milk')).toBe('milk');
    expect(canonicalizeIngredientName('  WHOLE   MILK  ')).toBe('milk');
    expect(canonicalizeIngredientName('milk')).toBe('milk');
    expect(canonicalizeIngredientName('Eggs')).toBe('egg');
    expect(canonicalizeIngredientName('Breast of Chicken')).toBe('chicken breast');
  });

  it('keeps unrecognised names stable (normalised only)', () => {
    expect(canonicalizeIngredientName('Panko')).toBe('panko');
  });
});

describe('pantry canonical merge + no-negative quantity', () => {
  it('merges photo-import spellings into one row and sums quantity', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    await service.upsertItem(userId, { ingredientName: 'Milk', quantity: 1, mergeQuantity: true });
    await service.upsertItem(userId, { ingredientName: '2% Milk', quantity: 1, mergeQuantity: true });
    await service.upsertItem(userId, { ingredientName: 'WHOLE MILK', quantity: 1, mergeQuantity: true });

    const pantry = await service.getPantry(userId);
    const milks = pantry.ingredients.filter((i) => i.ingredientName.toLowerCase() === 'milk');
    expect(milks).toHaveLength(1);
    expect(milks[0]!.quantity).toBe(3);
  });

  it('keeps overwrite semantics for manual adds (mergeQuantity off)', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    await service.upsertItem(userId, { ingredientName: 'rice', quantity: 2 });
    const updated = await service.upsertItem(userId, { ingredientName: 'rice', quantity: 5 });

    expect(updated.quantity).toBe(5);
    const pantry = await service.getPantry(userId);
    expect(pantry.ingredients.filter((i) => i.ingredientName === 'rice')).toHaveLength(1);
  });

  it('markUsed at qty=1 removes the row (no stale qty=0)', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    const item = await service.upsertItem(userId, { ingredientName: 'milk', quantity: 1 });
    const result = await service.markUsed(userId, item.ingredientName);

    expect(result.removed).toBe(true);
    const after = await service.getPantry(userId);
    expect(after.ingredients.find((i) => i.id === item.id)).toBeUndefined();
  });

  it('markUsed never leaves a negative quantity', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    const item = await service.upsertItem(userId, { ingredientName: 'eggs', quantity: 2 });
    await service.markUsed(userId, item.ingredientName);
    await service.markUsed(userId, item.ingredientName);

    const after = await service.getPantry(userId);
    const rows = after.ingredients.filter((i) => i.ingredientName === 'eggs');
    expect(rows.every((i) => (i.quantity ?? 0) >= 0)).toBe(true);
  });

  it('markUsed on an uncounted item does not destroy it', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    const item = await service.upsertItem(userId, { ingredientName: 'hot sauce' });
    const result = await service.markUsed(userId, item.ingredientName);

    expect(result.removed).toBe(false);
    const after = await service.getPantry(userId);
    expect(after.ingredients.find((i) => i.id === item.id)?.quantity).toBeNull();
  });
});

describe('pantry expiry pipeline', () => {
  it('flags expiring soon inside the 3-day window and exposes daysUntilExpiry', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    const soon = new Date();
    soon.setDate(soon.getDate() + 2);

    const far = new Date();
    far.setDate(far.getDate() + 7);

    await service.upsertItem(userId, { ingredientName: 'yogurt', quantity: 1, expiresAt: soon.toISOString() });
    await service.upsertItem(userId, { ingredientName: 'pasta', quantity: 1, expiresAt: far.toISOString() });

    const pantry = await service.getPantry(userId);
    const yogurt = pantry.ingredients.find((i) => i.ingredientName === 'yogurt');
    const pasta = pantry.ingredients.find((i) => i.ingredientName === 'pasta');

    expect(yogurt!.isExpiringSoon).toBe(true);
    expect(yogurt!.daysUntilExpiry).toBeLessThanOrEqual(3);
    expect(pasta!.isExpiringSoon).toBe(false);
    expect(pantry.expiringSoon.map((i) => i.ingredientName)).toEqual(['yogurt']);
  });
});

describe('pantry leftover vs pantry separation', () => {
  it('uses servings for leftovers and quantity for pantry items independently', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    const dish = await service.upsertItem(userId, {
      ingredientName: 'Beef Stew',
      kind: 'leftover',
      dishName: 'Beef Stew',
      servings: 2,
    });
    const eggs = await service.upsertItem(userId, { ingredientName: 'eggs', quantity: 2 });

    await service.markUsed(userId, dish.ingredientName);
    await service.markUsed(userId, eggs.ingredientName);

    const pantry = await service.getPantry(userId);
    expect(pantry.ingredients.find((i) => i.id === dish.id)?.servings).toBe(1);
    expect(pantry.ingredients.find((i) => i.id === dish.id)?.quantity).toBeNull();
    expect(pantry.ingredients.find((i) => i.id === eggs.id)?.quantity).toBe(1);
  });

  it('case-insensitive canonical lookup merges onto a legacy spelled row', async () => {
    const store = new FakeStore();
    const service = makeService(store);
    const userId = randomUUID();

    // Simulate a row written before canonicalisation existed (stored as "Milk").
    store.create({
      id: randomUUID(),
      userId,
      ingredientName: 'Milk',
      quantity: 1,
      unit: null,
      expiresAt: null,
      lastUsedAt: new Date(),
      usePriority: 0,
      kind: 'pantry',
      dishName: null,
      servings: null,
      notes: null,
      madeAt: null,
    });

    const merged = await service.upsertItem(userId, {
      ingredientName: '2% Milk',
      quantity: 1,
      mergeQuantity: true,
    });

    expect(merged.id).toBe(store.rows[0]!.id);
    expect(merged.quantity).toBe(2);
  });
});