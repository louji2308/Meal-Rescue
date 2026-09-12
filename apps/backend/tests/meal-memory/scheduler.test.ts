import { describe, expect, it } from '@jest/globals';

import type { Db } from '../../src/database/models';
import { runMealMemoryTick } from '../../src/services/meal-memory/scheduler';

describe('meal-memory scheduler', () => {
  it('expires only reservations whose expiry is in the past', async () => {
    let result: unknown;
    const updateCalls: Array<{ where: unknown; attrs: unknown }> = [];
    const update = async (attrs: unknown, opts: { where: unknown }) => {
      updateCalls.push({ attrs, where: opts.where });
      result = [2];
      return result;
    };
    const db = {
      sequelize: {} as never,
      models: {
        InventoryReservation: { update: update as never },
      } as unknown as Db['models'],
    } as Db;

    const count = await runMealMemoryTick(db, new Date('2026-09-10T12:00:00Z'));

    expect(count).toBe(2);
    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0]!;
    expect(call.attrs).toEqual({ active: false });
    expect(call.where).toMatchObject({ active: true });
    expect(call.where).toMatchObject({ expiresAt: expect.any(Object) });
  });
});
