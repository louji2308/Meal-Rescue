import type { CulinaryCompassSeed } from '@meal-rescue/shared-types';

import { TasteMemoryService } from '../src/services/taste-memory.service';

interface Row {
  id: string;
  userId: string;
  ingredient: string;
  contextType: string;
  contextValue: string;
  affinity: number;
  confidence: number;
  observationCount: number;
  source: string;
  lastUpdated: Date;
}

function fakeModels(rows: Row[] = []) {
  const store = rows;
  let seq = 0;
  return {
    models: {
      TasteMemory: {
        async findAll({ where }: { where: { userId: string } }) {
          return store
            .filter((r) => r.userId === where.userId)
            .sort((a, b) => b.confidence - a.confidence)
            .map((r) => ({ get: () => ({ ...r }) }));
        },
        async findOne({ where }: { where: Record<string, unknown> }) {
          const match = store.find((r) =>
            Object.entries(where).every(
              ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
            ),
          );
          return match
            ? {
                get: () => ({ ...match }),
                save: async () => {
                  match.lastUpdated = new Date();
                },
              }
            : null;
        },
        async create(row: Row) {
          const created = { ...row, id: `m${++seq}` };
          store.push(created);
          return created;
        },
      },
    },
    store,
  };
}

describe('TasteMemoryService cultural learning', () => {
  it('seedCompass writes cuisine_family and tradition_vs_modern priors', async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    const seed: CulinaryCompassSeed = { family: 'indian', traditionVsModern: -0.6 };
    await svc.seedCompass('u1', seed);
    expect(
      store.some((r) => r.contextType === 'cuisine_family' && r.contextValue === 'indian'),
    ).toBe(true);
    expect(
      store.some((r) => r.contextType === 'tradition_vs_modern' && r.contextValue === 'overall'),
    ).toBe(true);
  });

  it('getCuisineAffinities reflects seeded values', async () => {
    const { models } = fakeModels([
      {
        id: '1',
        userId: 'u1',
        ingredient: 'indian',
        contextType: 'cuisine_family',
        contextValue: 'indian',
        affinity: 0.8,
        confidence: 1.0,
        observationCount: 1,
        source: 'profile',
        lastUpdated: new Date(),
      },
    ]);
    const svc = new TasteMemoryService(models as never);
    const affinities = await svc.getCuisineAffinities('u1');
    expect(affinities.get('indian')).toBeCloseTo(0.8);
  });

  it('getTraditionVsModern defaults to 0 when unknown', async () => {
    const { models } = fakeModels([]);
    const svc = new TasteMemoryService(models as never);
    expect(await svc.getTraditionVsModern('u1')).toBe(0);
  });
});
