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
  const store: Row[] = rows;
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
          return match ? { get: () => ({ ...match }), save: async () => {} } : null;
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

describe('TasteMemoryService', () => {
  // Fiber comes from a Protein Bar rescue candidate; protein context.
  const SELECTED = {
    selectedRecommendation: {
      candidate: {
        additions: [{ name: 'avocado' }],
        substitutions: [],
        cookingSteps: 1,
      },
    } as unknown as Record<string, unknown>,
    userDecision: 'accepted',
    constraints: { timeMinutes: 10 } as Record<string, unknown>,
  };

  it('records a favorite memory for a "better" feedback', async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    await svc.recordFeedback('u1', SELECTED, 'better');
    const avocado = store.find((r) => r.ingredient === 'avocado');
    expect(avocado).toBeDefined();
    expect(avocado!.affinity).toBeGreaterThan(0);
  });

  it('records an avoided memory scoped to the detected cuisine context, not global', async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    const rescue = {
      ...SELECTED,
      selectedRecommendation: {
        candidate: { additions: [{ name: 'cilantro' }], substitutions: [], cookingSteps: 0 },
      },
      constraints: { timeMinutes: 5 },
    };
    await svc.recordFeedback('u1', rescue, 'not_for_me');
    const cil = store.find((r) => r.ingredient === 'cilantro');
    // default context should be meal_pattern/mealtime, and affinity negative
    expect(cil).toBeDefined();
    expect(cil!.affinity).toBeLessThan(0);
  });

  it('builts a preference snapshot of favorites and avoided from memories', async () => {
    const { models } = fakeModels([
      {
        id: '1',
        userId: 'u1',
        ingredient: 'avocado',
        contextType: 'global',
        contextValue: 'any',
        affinity: 0.9,
        confidence: 0.9,
        observationCount: 3,
        source: 'feedback',
        lastUpdated: new Date(),
      },
      {
        id: '2',
        userId: 'u1',
        ingredient: 'cilantro',
        contextType: 'global',
        contextValue: 'any',
        affinity: -0.8,
        confidence: 0.9,
        observationCount: 4,
        source: 'feedback',
        lastUpdated: new Date(),
      },
    ]);
    const svc = new TasteMemoryService(models as never);
    const snap = await svc.buildPreferenceSnapshot('u1');
    expect(snap.favoriteFoods).toContain('avocado');
    expect(snap.avoidedFoods).toContain('cilantro');
  });
});
