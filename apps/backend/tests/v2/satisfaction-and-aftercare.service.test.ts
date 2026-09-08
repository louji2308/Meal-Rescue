/**
 * V2 satisfaction + aftercare + decision-event services (plan §8, §9, §12).
 *
 * Satisfaction:
 *  - one SatisfactionRecord per rescue (idempotent upsert)
 *  - explicit satisfaction feeds preference learning at HIGHER weight
 *    (plan §8: explicit feedback out-weights passive history)
 *  - records a SATISFACTION_RECORDED DecisionEvent
 *
 * Aftercare:
 *  - eligibility matrix over NO_RESCUE / ALREADY_SENT / COOLDOWN /
 *    FEEDBACK_DISABLED / OK
 *  - keyless dry-run returns eligibility WITHOUT sending or crashing
 */
import { randomUUID } from 'node:crypto';

import type { Db } from '../../src/database/models';
import { AftercareService } from '../../src/services/v2/aftercare.service';
import { DecisionEventService } from '../../src/services/v2/decision-events.service';
import { SatisfactionService } from '../../src/services/v2/satisfaction.service';

type Row = Record<string, unknown> & {
  save?: () => Promise<void>;
  set?: (p: Record<string, unknown>) => void;
};

function storeSim() {
  const seeds: Array<{ table: string; row: Row }> = [];
  const events: Row[] = [];
  const preferences: Array<Row & { confidenceScore: number; observationCount: number }> = [];

  const rowOf = (
    table: string,
    data: Record<string, unknown>,
  ): Row & { get(): Record<string, unknown> } => {
    const current = {
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
    };
    const guard: Row & { get(): Record<string, unknown> } = {
      ...current,
      get: () => ({ ...current }),
      set: (patch: Record<string, unknown>) => {
        Object.assign(current, patch);
        Object.assign(guard, patch);
      },
      save: async () => undefined,
    };
    return guard;
  };

  const models = {
    Rescue: {
      async findOne({ where }: { where: { id: string; userId: string } }) {
        return (
          seeds.find(
            (s) => s.table === 'Rescue' && s.row.id === where.id && s.row.userId === where.userId,
          )?.row ?? null
        );
      },
    },
    SatisfactionRecord: {
      async findOne({ where }: { where: { rescueId: string; userId: string } }) {
        const found = seeds.find(
          (s) =>
            s.table === 'SatisfactionRecord' &&
            s.row.rescueId === where.rescueId &&
            s.row.userId === where.userId,
        )?.row;
        return found ?? null;
      },
      async create(data: Record<string, unknown>) {
        const row = rowOf('SatisfactionRecord', data);
        seeds.push({ table: 'SatisfactionRecord', row });
        return row;
      },
    },
    DecisionEvent: {
      async create(data: Record<string, unknown>) {
        events.push(rowOf('DecisionEvent', data));
        return events[events.length - 1];
      },
      async count({ where }: { where: { rescueId?: string; eventType?: string } }) {
        return events.filter(
          (e) =>
            (where.rescueId ? e.rescueId === where.rescueId : true) &&
            (where.eventType ? e.eventType === where.eventType : true),
        ).length;
      },
      async findOne({
        where,
        order,
      }: {
        where: { rescueId: string; eventType: string };
        order: unknown;
      }) {
        void order;
        const found = events
          .filter((e) => e.rescueId === where.rescueId && e.eventType === where.eventType)
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
        return found ? { get: () => ({ ...found }), createdAt: found.createdAt } : null;
      },
    },
    User: {
      async findByPk(id: string) {
        const found = seeds.find((s) => s.table === 'User' && s.row.id === id);
        return found ? found.row : null;
      },
    },
    TasteMemory: {
      async findOne({ where }: { where: Record<string, unknown> }) {
        const found = seeds.find(
          (s) =>
            s.table === 'TasteMemory' && Object.entries(where).every(([k, v]) => s.row[k] === v),
        )?.row;
        return found ? { get: () => ({ ...found }), set: found.set!, save: found.save! } : null;
      },
      async findAll({ where }: { where: Record<string, unknown> }) {
        return seeds
          .filter(
            (s) =>
              s.table === 'TasteMemory' && Object.entries(where).every(([k, v]) => s.row[k] === v),
          )
          .map((s) => ({ get: () => ({ ...s.row }) }));
      },
      async create(data: Record<string, unknown>) {
        const row = rowOf('TasteMemory', data);
        seeds.push({ table: 'TasteMemory', row });
        return { get: () => ({ ...row }) };
      },
    },
    Preference: {
      async findOne({ where }: { where: Record<string, unknown> }) {
        return (
          preferences.find((p) =>
            Object.entries(where).every(([k, v]) => (p as Record<string, unknown>)[k] === v),
          ) ?? null
        );
      },
      async create(data: Record<string, unknown>) {
        const row = {
          ...data,
          confidenceScore: Number(data.confidenceScore),
          observationCount: 1,
          save: async () => undefined,
        } as (typeof preferences)[number];
        preferences.push(row);
        return row;
      },
    },
  } as unknown as Db['models'];

  return { models, events, preferences, seeds, rowOf };
}

function rescueRow(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    userId: randomUUID(),
    selectedRecommendation: {
      candidate: { additions: [], substitutions: [], cookingSteps: 0, estimatedTime: 5 },
    },
    userDecision: 'accepted',
    constraints: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SatisfactionService', () => {
  it('records a satisfaction row and reports a user-facing impact line', async () => {
    const sim = storeSim();
    const rescue = rescueRow();
    sim.seeds.push({ table: 'Rescue', row: sim.rowOf('Rescue', rescue) });

    const service = new SatisfactionService(sim.models);
    const response = await service.record(rescue.id as string, rescue.userId as string, {
      result: 'EXACTLY',
      reason: [],
    });

    expect(response.success).toBe(true);
    expect(response.recorded.result).toBe('EXACTLY');
    expect(response.personalizationImpact.length).toBeGreaterThan(0);
  });

  it('is idempotent: re-recording updates the same row', async () => {
    const sim = storeSim();
    const rescue = rescueRow();
    sim.seeds.push({ table: 'Rescue', row: sim.rowOf('Rescue', rescue) });
    const service = new SatisfactionService(sim.models);

    await service.record(rescue.id as string, rescue.userId as string, { result: 'ALMOST' });
    await service.record(rescue.id as string, rescue.userId as string, {
      result: 'NOT_REALLY',
      reason: ['too_much_effort'],
    });

    const rows = sim.seeds.filter((s) => s.table === 'SatisfactionRecord');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.row.result).toBe('NOT_REALLY');
  });

  it('records a SATISFACTION_RECORDED decision event', async () => {
    const sim = storeSim();
    const rescue = rescueRow();
    sim.seeds.push({ table: 'Rescue', row: sim.rowOf('Rescue', rescue) });
    const service = new SatisfactionService(sim.models);

    await service.record(rescue.id as string, rescue.userId as string, { result: 'EXACTLY' });

    const event = sim.events.find((e) => e.eventType === 'SATISFACTION_RECORDED');
    expect(event).toBeDefined();
    expect(event?.rescueId).toBe(rescue.id);
  });

  it('explicit satisfaction is a HIGHER-weight learning signal than passive feedback', async () => {
    // Same rescue/feedback each run; only the boost differs. The explicit
    // path (weightBoost 2) must land a higher confidenceScore.
    const baseline = await learnedConfidenceAfter('better', 1);
    const boosted = await learnedConfidenceAfter('better', 2);
    expect(boosted).toBeGreaterThan(baseline);
  });

  it('getForRescue returns null when nothing recorded yet', async () => {
    const sim = storeSim();
    const service = new SatisfactionService(sim.models);
    const result = await service.getForRescue(randomUUID(), randomUUID());
    expect(result).toBeNull();
  });

  async function learnedConfidenceAfter(satisfaction: 'better', boost: number): Promise<number> {
    const sim = storeSim();
    const rescue = rescueRow({
      userDecision: 'accepted',
      selectedRecommendation: {
        candidate: {
          additions: [{ name: 'egg' }],
          substitutions: [],
          cookingSteps: 0,
          estimatedTime: 5,
        },
      },
    });
    sim.seeds.push({ table: 'Rescue', row: sim.rowOf('Rescue', rescue) });

    await new PreferenceHarness(sim.models).process(
      rescue.userId as string,
      rescue as unknown as Record<string, unknown>,
      satisfaction,
      boost,
    );

    const pref = sim.preferences.find(
      (p) => p.preferenceType === 'favorite_ingredient' && p.preferenceKey === 'egg',
    );
    return pref ? pref.confidenceScore : 0;
  }
});

// Reaches PreferenceLearningService directly so the weight effect is isolated.
class PreferenceHarness {
  private readonly models: Db['models'];
  constructor(models: Db['models']) {
    this.models = models;
  }
  async process(
    userId: string,
    rescue: Record<string, unknown>,
    satisfaction: string,
    boost: number,
  ): Promise<void> {
    const { PreferenceLearningService } =
      await import('../../src/services/preference-learning.service');
    const learning = new PreferenceLearningService(this.models);
    await learning.processFeedback(
      userId,
      {
        selectedRecommendation: rescue.selectedRecommendation as Record<string, unknown>,
        userDecision: String(rescue.userDecision),
        constraints: rescue.constraints as Record<string, unknown> | undefined,
      },
      satisfaction,
      undefined,
      undefined,
      boost,
    );
  }
}

describe('DecisionEventService', () => {
  it('counts and checks events per rescue+type (aftercare dedupe primitive)', async () => {
    const sim = storeSim();
    const events = new DecisionEventService(sim.models);
    const rescueId = randomUUID();

    await events.record({ eventType: 'RESCUE_STARTED', userId: randomUUID(), rescueId });
    await events.record({ eventType: 'MEAL_COMPLETED', userId: randomUUID(), rescueId });

    expect(await events.existsForRescue(rescueId, 'MEAL_COMPLETED')).toBe(true);
    expect(await events.existsForRescue(rescueId, 'SATISFACTION_RECORDED')).toBe(false);
    expect(await events.countForRescue(rescueId, 'MEAL_COMPLETED')).toBe(1);
  });
});

describe('AftercareService', () => {
  const user = { id: randomUUID() };

  function aftercareHarness(
    overrides: {
      completed?: boolean;
      sent?: boolean;
      feedbackEnabled?: boolean;
      completedAtAgeMs?: number;
    } = {},
  ) {
    const sim = storeSim();
    const rescue = rescueRow({ id: randomUUID(), userId: user.id });
    sim.seeds.push({ table: 'Rescue', row: sim.rowOf('Rescue', rescue) });
    sim.seeds.push({
      table: 'User',
      row: sim.rowOf('User', { id: user.id, feedbackEnabled: overrides.feedbackEnabled ?? true }),
    });
    if (overrides.completed !== false) {
      sim.events.push(
        sim.rowOf('DecisionEvent', {
          eventType: 'MEAL_COMPLETED',
          rescueId: rescue.id,
          createdAt: new Date(Date.now() - (overrides.completedAtAgeMs ?? 60 * 60 * 1000)),
        }),
      );
    }
    if (overrides.sent) {
      sim.events.push(
        sim.rowOf('DecisionEvent', {
          eventType: 'NOTIFICATION_SENT',
          rescueId: rescue.id,
          createdAt: new Date(),
        }),
      );
    }
    return { sim, service: new AftercareService(sim.models), rescueId: rescue.id as string };
  }

  it('returns NO_RESCUE when the rescue does not exist', async () => {
    const sim = storeSim();
    const service = new AftercareService(sim.models);
    expect(await service.eligibility(randomUUID(), randomUUID())).toEqual({
      eligible: false,
      reason: 'NO_RESCUE',
    });
  });

  it('returns NO_RESCUE when the meal was never completed', async () => {
    const { service, rescueId } = aftercareHarness({ completed: false });
    expect(await service.eligibility(rescueId, user.id)).toEqual({
      eligible: false,
      reason: 'NO_RESCUE',
    });
  });

  it('returns ALREADY_SENT when an aftercare check-in already fired', async () => {
    const { service, rescueId } = aftercareHarness({ sent: true });
    expect(await service.eligibility(rescueId, user.id)).toEqual({
      eligible: false,
      reason: 'ALREADY_SENT',
    });
  });

  it('returns COOLDOWN when the meal was completed too recently', async () => {
    const { service, rescueId } = aftercareHarness({ completedAtAgeMs: 5 * 60 * 1000 });
    expect(await service.eligibility(rescueId, user.id)).toEqual({
      eligible: false,
      reason: 'COOLDOWN',
    });
  });

  it('returns FEEDBACK_DISABLED when the user opted out of feedback', async () => {
    const { service, rescueId } = aftercareHarness({
      feedbackEnabled: false,
      completedAtAgeMs: 10 * 60 * 60 * 1000,
    });
    expect(await service.eligibility(rescueId, user.id)).toEqual({
      eligible: false,
      reason: 'FEEDBACK_DISABLED',
    });
  });

  it('returns OK (dry-run, no send) when eligible and OneSignal is unconfigured', async () => {
    const { service, rescueId } = aftercareHarness({ completedAtAgeMs: 10 * 60 * 60 * 1000 });
    expect(await service.eligibility(rescueId, user.id)).toEqual({ eligible: true, reason: 'OK' });
  });
});
