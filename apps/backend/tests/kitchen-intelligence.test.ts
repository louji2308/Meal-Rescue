import { describe, expect, it } from '@jest/globals';

import type { PantryItem } from '@meal-rescue/shared-types';

import { KitchenIntelligenceService, KitchenItem } from '../src/services/kitchen-intelligence.service';

function makeItem(overrides: Partial<PantryItem> & { ingredientName: string }): PantryItem {
  return {
    id: overrides.ingredientName.toLowerCase().replace(/ /g, '-'),
    quantity: null,
    unit: null,
    addedAt: new Date().toISOString(),
    expiresAt: null,
    lastUsedAt: null,
    usePriority: 0,
    daysUntilExpiry: null,
    isExpiringSoon: false,
    isLowStock: false,
    kind: 'pantry',
    dishName: null,
    servings: null,
    notes: null,
    madeAt: null,
    ...overrides,
  };
}

describe('kitchen intelligence leftovers', () => {
  it('maps kind=leftover items to the leftover state and derives the reason from madeAt', async () => {
    const leftover = makeItem({
      ingredientName: 'Chicken Biryani',
      kind: 'leftover',
      dishName: 'Chicken Biryani',
      servings: 2,
      madeAt: new Date().toISOString(),
    });

    const fakePantry = {
      getPantry: async () => ({ ingredients: [leftover], expiringSoon: [], lowStock: [], suggestedUses: [] }),
    };
    const service = new KitchenIntelligenceService(fakePantry as never);

    const dashboard = await service.getDashboard('user-1');
    const item = dashboard.items[0] as KitchenItem;
    expect(item.state).toBe('leftover');
    expect(item.stateReason).toBe('Made today');
    expect(dashboard.stats.leftoverCount).toBe(1);
  });

  it('never emits a low_stock kitchen signal even if an item reports low stock', async () => {
    const low = makeItem({
      ingredientName: 'chicken',
      isLowStock: true,
      quantity: 0.5,
      unit: 'kg',
    });

    const fakePantry = {
      getPantry: async () => ({ ingredients: [low], expiringSoon: [], lowStock: [low], suggestedUses: [] }),
    };
    const service = new KitchenIntelligenceService(fakePantry as never);

    const dashboard = await service.getDashboard('user-1');
    expect(dashboard.signals.every((s) => s.type !== 'low_stock')).toBe(true);
  });
});