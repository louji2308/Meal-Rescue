import {
  MealCompletionService,
  confidenceFor,
  confidenceState,
  weightedPosterior,
} from '../src/services/meal-completion.service';
import { PAIRS } from '../src/services/onboarding';

type MemoryRow = {
  id: string;
  userId: string;
  ingredient: string;
  contextType: string;
  contextValue: string;
  affinity: number;
  confidence: number;
  observationCount: number;
  source: string;
};

type EventRow = {
  id: string;
  userId: string;
  pairId: string;
  selected: string | null;
  state: string;
};

function fakeModels() {
  const memories: MemoryRow[] = [];
  const events: EventRow[] = [];
  const models = {
    TasteMemory: {
      async findAll({
        where,
      }: {
        where: Partial<MemoryRow>;
      }): Promise<Array<{ get(): MemoryRow }>> {
        return memories
          .filter((m) =>
            Object.entries(where).every(([k, v]) => (m as Record<string, unknown>)[k] === v),
          )
          .map((m) => ({ get: () => ({ ...m }) }));
      },
      async findOne({
        where,
      }: {
        where: Partial<MemoryRow>;
      }): Promise<{
        get(): MemoryRow;
        set(p: Partial<MemoryRow>): void;
        save(): Promise<void>;
      } | null> {
        const found = memories.find((m) =>
          Object.entries(where).every(([k, v]) => (m as Record<string, unknown>)[k] === v),
        );
        if (!found) return null;
        let current = { ...found };
        return {
          get: () => ({ ...current }),
          set: (p) => {
            current = { ...current, ...p };
          },
          save: async () => {
            const idx = memories.findIndex((m) => m.id === current.id);
            memories[idx] = { ...current };
          },
        };
      },
      async create(p: MemoryRow): Promise<{ get(): MemoryRow }> {
        memories.push(p);
        return { get: () => ({ ...p }) };
      },
    },
    AdditionEvent: {
      async create(p: EventRow): Promise<{ get(): EventRow }> {
        events.push(p);
        return { get: () => ({ ...p }) };
      },
      async count({ where }: { where: Partial<EventRow> }): Promise<number> {
        return events.filter((e) =>
          Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v),
        ).length;
      },
      async findAll({
        where,
      }: {
        where: Partial<EventRow>;
      }): Promise<Array<{ get(key?: string): EventRow | EventRow[keyof EventRow] }>> {
        return events
          .filter((e) =>
            Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v),
          )
          .map((e) => ({
            get: (key?: string): EventRow | EventRow[keyof EventRow] =>
              key ? ((e as Record<string, unknown>)[key] as EventRow[keyof EventRow]) : e,
          }));
      },
    },
  };
  return { models, memories, events };
}

describe('meal-completion inference', () => {
  it('computes the weighted posterior and decays the prior over evidence', () => {
    expect(weightedPosterior(0, 0, 0.5, 0.6)).toBeCloseTo(0.3);
    expect(weightedPosterior(0.3, 1, 0.5, 0.6)).toBeCloseTo(0.39);
    // Accumulating same-direction evidence pulls the affinity toward +0.5.
    let a = 0;
    for (let i = 0; i < 10; i += 1) {
      a = weightedPosterior(a, i, 0.5, 0.6);
    }
    expect(a).toBeGreaterThan(0.4);
  });

  it('caps confidence at 0.9 and derives inferred/confirmed states', () => {
    expect(confidenceFor(0, 0)).toBe(0);
    expect(confidenceState(0, 0)).toBe('unknown');
    expect(confidenceState(2, 0.2)).toBe('inferred');
    expect(confidenceState(3, 0.2)).toBe('confirmed');
    expect(confidenceState(1, 0.5)).toBe('confirmed');
    expect(confidenceFor(50, 1)).toBe(0.9);
  });

  it('runs a full adaptive onboarding to a 5-factor summary', async () => {
    const { models } = fakeModels();
    const service = new MealCompletionService(models as unknown as never);

    const start = await service.startOnboarding('u1');
    expect(start.seeded).toBe(false);
    expect(start.pair).not.toBeNull();

    let pair = start.pair!;
    for (let i = 0; i < PAIRS.length; i += 1) {
      const res = await service.answerOnboarding('u1', {
        pairId: pair.id,
        selected: 'A',
        unavailableOption: null,
      });
      if (i < PAIRS.length - 1) {
        expect(res.next).not.toBeNull();
        pair = res.next!;
      } else {
        expect(res.next).toBeNull();
        expect(res.summary).not.toBeNull();
      }
    }

    const summary = await service.getSummary('u1');
    expect(summary.seeded).toBe(true);
    expect(summary.factors).toHaveLength(5);
    for (const f of summary.factors) {
      expect(['nutritional', 'sensory', 'satisfaction', 'modification', 'exploration']).toContain(
        f.factor,
      );
      expect(['unknown', 'inferred', 'confirmed']).toContain(f.confidence);
      expect(f.score).toBeGreaterThanOrEqual(-1);
      expect(f.score).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(summary.mealGroupAffinities).length).toBeGreaterThanOrEqual(1);
  });

  it('never writes cuisine-family rows during cold-start', async () => {
    const { models, memories } = fakeModels();
    const service = new MealCompletionService(models as unknown as never);
    const start = await service.startOnboarding('u2');
    let pair = start.pair!;
    for (let i = 0; i < PAIRS.length; i += 1) {
      const res = await service.answerOnboarding('u2', {
        pairId: pair.id,
        selected: 'B',
        unavailableOption: null,
      });
      if (res.next) pair = res.next;
    }
    for (const m of memories) {
      expect(m.contextType).not.toBe('cuisine');
      expect(m.contextType).not.toBe('cuisine_family');
      expect(m.source).toBe('cold_start');
    }
  });
});
