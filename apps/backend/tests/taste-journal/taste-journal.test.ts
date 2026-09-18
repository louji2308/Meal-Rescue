/**
 * Taste Journal - evidence store, aggregation, and editorial rendering.
 *
 * The five non-negotiables under test:
 *  1. Nothing is ever asserted without recorded evidence behind it.
 *  2. Aggregation + copy are deterministic (same evidence in, same journal out).
 *  3. Backfill runs once and replays are idempotent (dedupe keys).
 *  4. Explicit onboarding cuisines are a boundary - never auto-expanded,
 *     but dismissable/forgettable like any other insight.
 *  5. Overrides (dismiss / correct / forget) re-shape the presentation only;
 *     raw evidence is never mutated by a control action.
 */
import { randomUUID } from 'node:crypto';

import type { Db } from '../../src/database/models';
import { PreferenceAggregationService } from '../../src/services/taste-journal/preference-aggregation.service';
import { ContextualPatternService } from '../../src/services/taste-journal/contextual-pattern.service';
import { TasteInsightService } from '../../src/services/taste-journal/taste-insight.service';
import { TasteJournalService } from '../../src/services/taste-journal/taste-journal.service';
import {
  computeConfidence,
  computePolarity,
  computeStatus,
  round2,
} from '../../src/services/taste-journal/taste-signal.service';
import { AppError } from '../../src/lib/errors';
import type {
  TasteSignal,
  TasteSignalSource,
} from '@meal-rescue/shared-types';

// ---------------------------------------------------------------------------
// In-memory store so the whole evidence -> journal pipeline runs without a DB.
// ---------------------------------------------------------------------------

type Where = Record<string, unknown>;
type OrderEntry = [string, 'ASC' | 'DESC'];

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function orderRows(list: Array<Record<string, unknown>>, order?: OrderEntry[]): Array<Record<string, unknown>> {
  if (!order) return list;
  return [...list].sort((a, b) => {
    for (const [raw, dir] of order) {
      const key = raw.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      const cmp = av instanceof Date && bv instanceof Date ? av.getTime() - bv.getTime() : (av as number) - (bv as number);
      return dir === 'ASC' ? cmp : -cmp;
    }
    return 0;
  });
}

class MemStore {
  rows: Record<string, Array<Record<string, unknown>>> = {};

  private wrap(table: string, backing: Record<string, unknown>) {
    let guard: Record<string, unknown> & { update(patch: Where): void } = {} as never;
    const update = (patch: Where) => {
      Object.assign(backing, patch);
      Object.assign(guard, patch);
    };
    guard = { ...backing, update };
    return guard;
  }

  insert(table: string, data: Record<string, unknown>) {
    const backing: Record<string, unknown> = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    (this.rows[table] ??= []).push(backing);
    return this.wrap(table, backing);
  }

  find(table: string, where: Where): Record<string, unknown> | null {
    const backing = (this.rows[table] ?? []).find((r) => matches(r, where));
    return backing ? this.wrap(table, backing) : null;
  }

  all(table: string, where: Where = {}, order?: OrderEntry[]): ReturnType<MemStore['wrap']>[] {
    const backing = orderRows((this.rows[table] ?? []).filter((r) => matches(r, where)), order);
    return backing.map((b) => this.wrap(table, b));
  }

  delete(table: string, where: Where): number {
    const before = this.rows[table]?.length ?? 0;
    this.rows[table] = (this.rows[table] ?? []).filter((r) => !matches(r, where));
    return before - (this.rows[table]?.length ?? 0);
  }
}

function buildModels(store: MemStore): Db['models'] {
  const TasteSignal = {
    async findOrCreate({ where }: { where: Where }) {
      const existing = store.find('TasteSignal', where);
      if (existing) return [existing, false] as const;
      return [store.insert('TasteSignal', { ...where }), true] as const;
    },
    async findOne({ where }: { where: Where }) {
      return store.find('TasteSignal', where);
    },
    async findAll({ where, order }: { where: Where; order?: OrderEntry[] }) {
      return store.all('TasteSignal', where, order);
    },
    async destroy({ where }: { where: Where }) {
      const id = where.id as string;
      if (id) {
        // FK cascade: destroying a strand removes its evidence.
        store.delete('TasteSignalEvidence', { signalId: id });
      }
      return store.delete('TasteSignal', where);
    },
    async update() {
      throw new Error('not used');
    },
  };

  const TasteSignalEvidence = {
    async findOne({ where }: { where: Where }) {
      return store.find('TasteSignalEvidence', where);
    },
    async findAll({ where, order }: { where: Where; order?: OrderEntry[] }) {
      return store.all('TasteSignalEvidence', where, order);
    },
    async create(data: Record<string, unknown>) {
      return store.insert('TasteSignalEvidence', data);
    },
  };

  const TasteInsightOverride = {
    async findOne({ where }: { where: Where }) {
      return store.find('TasteInsightOverride', where);
    },
    async findAll({ where }: { where: Where }) {
      return store.all('TasteInsightOverride', where);
    },
    async create(data: Record<string, unknown>) {
      return store.insert('TasteInsightOverride', data);
    },
    async destroy({ where }: { where: Where }) {
      return store.delete('TasteInsightOverride', where);
    },
  };

  const TasteJournalMeta = {
    async findOne({ where }: { where: Where }) {
      return store.find('TasteJournalMeta', where);
    },
    async create(data: Record<string, unknown>) {
      return store.insert('TasteJournalMeta', data);
    },
  };

  const TasteMemory = {
    async findAll({ where }: { where: Where }) {
      return store.all('TasteMemory', where).map((g) => {
        const { update: _update, ...backing } = g;
        return { ...backing, get: () => backing };
      });
    },
  };

  const TasteEvent = {
    async findAll({ where, order }: { where: Where; order?: OrderEntry[] }) {
      return store.all('TasteEvent', where, order);
    },
  };

  const AdditionEvent = {
    async findAll({ where }: { where: Where }) {
      return store.all('AdditionEvent', where).map((g) => {
        const { update: _update, ...backing } = g;
        return { ...backing, get: () => backing };
      });
    },
  };

  return {
    TasteSignal,
    TasteSignalEvidence,
    TasteInsightOverride,
    TasteJournalMeta,
    TasteMemory,
    TasteEvent,
    AdditionEvent,
  } as unknown as Db['models'];
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const userId = () => randomUUID();

function signal(overrides: Partial<TasteSignal> & { value: string }): TasteSignal {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    userId: '',
    dimension: 'ingredient',
    polarity: 'positive',
    confidence: 0.5,
    status: 'EMERGING',
    evidenceCount: 1,
    positiveCount: 1,
    negativeCount: 0,
    neutralCount: 0,
    sourceTypes: ['BEHAVIOR'],
    primarySourceType: 'BEHAVIOR',
    contexts: [],
    firstObservedAt: now,
    lastObservedAt: now,
    ...overrides,
  };
}

function piece(
  polarity: 'positive' | 'negative' | 'neutral',
  source: TasteSignalSource = 'BEHAVIOR',
  weight = 1,
  context?: { type: string; value: string },
): {
  polarity: 'positive' | 'negative' | 'neutral';
  source: TasteSignalSource;
  weight: number;
  contextType?: string | null;
  contextValue?: string | null;
  occurredAt: Date;
} {
  return {
    polarity,
    source,
    weight,
    contextType: context?.type,
    contextValue: context?.value,
    occurredAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// 1. Pure math
// ---------------------------------------------------------------------------

describe('journal math', () => {
  it('round2 keeps a stable 2-decimal precision', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.345)).toBe(1.35);
    expect(round2(0.5)).toBe(0.5);
    expect(round2(0.666666)).toBe(0.67);
  });

  it('confidence grows with evidence but never reaches 1', () => {
    expect(computeConfidence([])).toBe(0);
    const weak = computeConfidence([piece('positive', 'BEHAVIOR', 1)]);
    const strong = computeConfidence(Array.from({ length: 10 }, () => piece('positive', 'BEHAVIOR', 1)));
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThan(1);
  });

  it('neutral-heavy evidence is discounted', () => {
    const allNeutral = computeConfidence(Array.from({ length: 4 }, () => piece('neutral', 'BEHAVIOR', 1)));
    const halfNeutral = computeConfidence([
      piece('positive', 'BEHAVIOR', 1),
      piece('positive', 'BEHAVIOR', 1),
      piece('neutral', 'BEHAVIOR', 1),
      piece('neutral', 'BEHAVIOR', 1),
    ]);
    expect(allNeutral).toBeLessThan(halfNeutral);
  });

  it('polarity: majority, minority conflict, and neutral', () => {
    expect(computePolarity([piece('positive', 'BEHAVIOR', 1), piece('positive', 'BEHAVIOR', 1)])).toBe('positive');
    expect(computePolarity([piece('negative', 'BEHAVIOR', 1), piece('negative', 'BEHAVIOR', 1)])).toBe('negative');
    expect(
      computePolarity([piece('positive', 'BEHAVIOR', 1), piece('negative', 'BEHAVIOR', 1)]),
    ).toBe('mixed');
    expect(computePolarity([piece('neutral', 'BEHAVIOR', 1)])).toBe('neutral');
  });

  it('status: emerging -> established -> explicit as evidence strengthens', () => {
    const one = computeStatus([piece('positive', 'BEHAVIOR', 1)], 0.2);
    expect(one).toBe('EMERGING');

    const three = Array.from({ length: 3 }, () => piece('positive', 'BEHAVIOR', 1));
    expect(computeStatus(three, 0.82)).toBe('ESTABLISHED');

    const threeExplicit = Array.from({ length: 3 }, () => piece('positive', 'EXPLICIT_FEEDBACK', 1.5));
    expect(computeStatus(threeExplicit, 0.82)).toBe('EXPLICIT');
  });

  it('status: opposing evidence reads conflicted, not neutral', () => {
    const split = [
      piece('positive', 'BEHAVIOR', 1),
      piece('positive', 'BEHAVIOR', 1),
      piece('negative', 'BEHAVIOR', 1),
      piece('negative', 'BEHAVIOR', 1),
    ];
    expect(computeStatus(split, 0.4)).toBe('CONFLICTED');
  });

  it('status: one context owning the evidence reads contextual', () => {
    const contextual = [
      piece('positive', 'BEHAVIOR', 1, { type: 'cuisine', value: 'italian' }),
      piece('positive', 'BEHAVIOR', 1, { type: 'cuisine', value: 'italian' }),
      piece('positive', 'BEHAVIOR', 1, { type: 'cuisine', value: 'italian' }),
    ];
    expect(computeStatus(contextual, 0.6)).toBe('CONTEXTUAL');
  });
});

// ---------------------------------------------------------------------------
// 2. Aggregation
// ---------------------------------------------------------------------------

describe('PreferenceAggregationService.buildLandscape', () => {
  const agg = new PreferenceAggregationService();

  it('caps patterns at 5, ranks by confidence, positive only', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      signal({ value: `ing${i}`, status: 'ESTABLISHED', confidence: 0.5 + i / 20, polarity: 'positive' }),
    );
    const landscape = agg.buildLandscape('u', signals);
    expect(landscape.patterns).toHaveLength(5);
    expect([...landscape.patterns].map((s) => s.confidence)).toEqual(
      [...landscape.patterns].map((s) => s.confidence).sort((a, b) => b - a),
    );
  });

  it('negative established strands feed avoidances, never patterns', () => {
    const landscape = agg.buildLandscape('u', [
      signal({ value: 'mushy', status: 'ESTABLISHED', polarity: 'negative' }),
      signal({ value: 'tangy', status: 'ESTABLISHED', polarity: 'positive' }),
    ]);
    expect(landscape.patterns.map((s) => s.value)).toEqual(['tangy']);
    expect(landscape.avoidances.map((s) => s.value)).toEqual(['mushy']);
  });

  it('UNKNOWN and DISMISSED strands are never surfaced', () => {
    const landscape = agg.buildLandscape('u', [
      signal({ value: 'x', status: 'UNKNOWN', confidence: 0.9 }),
      signal({ value: 'y', status: 'DISMISSED', confidence: 0.9 }),
    ]);
    expect(landscape.active).toHaveLength(0);
  });

  it('conflicted strands feed still learning, not patterns', () => {
    const landscape = agg.buildLandscape('u', [
      signal({ value: 'chicken', status: 'CONFLICTED', polarity: 'mixed', evidenceCount: 4 }),
    ]);
    expect(landscape.patterns).toHaveLength(0);
    expect(landscape.stillLearning.map((s) => s.value)).toEqual(['chicken']);
  });

  it('an emerging single-shot strand is a discovery and still learning', () => {
    const landscape = agg.buildLandscape('u', [
      signal({ value: 'peanuts', status: 'EMERGING', evidenceCount: 1, polarity: 'positive' }),
    ]);
    expect(landscape.discoveries.map((s) => s.value)).toEqual(['peanuts']);
    expect(landscape.stillLearning.map((s) => s.value)).toEqual(['peanuts']);
  });
});

// ---------------------------------------------------------------------------
// 3. Contextual patterns ("it depends")
// ---------------------------------------------------------------------------

describe('ContextualPatternService', () => {
  const ctx = new ContextualPatternService();

  it('splits a strand whose contexts disagree on polarity', () => {
    const split = ctx.buildDependentPatterns([
      signal({
        value: 'spice',
        status: 'CONTEXTUAL',
        contexts: [
          { contextType: 'cuisine', contextValue: 'mexican', count: 3, share: 0.5, polarity: 'positive' },
          { contextType: 'cuisine', contextValue: 'italian', count: 3, share: 0.5, polarity: 'negative' },
        ],
      }),
    ]);
    expect(split).toHaveLength(1);
    expect(split[0]!.split.map((c) => c.label).sort()).toEqual(['Italian', 'Mexican']);
  });

  it('ignores single-direction contexts', () => {
    const split = ctx.buildDependentPatterns([
      signal({
        value: 'sweet',
        status: 'CONTEXTUAL',
        contexts: [
          { contextType: 'cuisine', contextValue: 'mexican', count: 2, share: 1, polarity: 'positive' },
        ],
      }),
    ]);
    expect(split).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Deterministic editorial copy
// ---------------------------------------------------------------------------

describe('TasteInsightService templates', () => {
  const insights = new TasteInsightService();

  it('renders explicit onboarding cuisine with clear attribution', () => {
    const built = insights.renderExplicitCuisineBoundary('italian');
    expect(built.title).toBe('Italian');
    expect(built.body).toContain('You told us');
    expect(built.sourceTypes).toEqual(['ONBOARDING']);
    expect(built.kind).toBe('boundary');
  });

  it('same evidence produces identical copy (determinism)', () => {
    const s = signal({ value: 'tangy', status: 'ESTABLISHED', confidence: 0.8, polarity: 'positive' });
    const a = insights.renderPattern(s);
    const b = insights.renderPattern(s);
    expect(a).toEqual(b);
    expect(a.kind).toBe('pattern');
    expect(a.body.length).toBeGreaterThan(0);
  });

  it('negative assert-safe phrasing: avoids are explicit, never fabricated', () => {
    const s = signal({ value: 'tripe', status: 'ESTABLISHED', polarity: 'negative' });
    const built = insights.renderPattern(s);
    expect(built.title).toContain('avoid');
  });

  it('an insight card must not carry a fake percentage', () => {
    const s = signal({ value: 'olives', status: 'ESTABLISHED', confidence: 0.71, polarity: 'positive' });
    const body = insights.renderPattern(s).body;
    expect(body).not.toMatch(/\d+%/);
  });
});

// ---------------------------------------------------------------------------
// 5. Full pipeline: evidence store -> journal -> overrides -> backfill
// ---------------------------------------------------------------------------

describe('TasteJournalService pipeline', () => {
  const store = new MemStore();
  const models = buildModels(store);
  const journal = new TasteJournalService(models);
  const u = userId();

  const addLive = async (opts: {
    ingredient: string;
    count: number;
    polarity: 'positive' | 'negative';
    source?: TasteSignalSource;
  }) => {
    const { ingredient, count, polarity, source = 'BEHAVIOR' } = opts;
    const jobs = [];
    for (let i = 0; i < count; i++) {
      jobs.push(
        journal.addSignal({
          userId: u,
          dimension: 'ingredient',
          value: ingredient,
          polarity,
          source,
          sourceLabel: source === 'EXPLICIT_FEEDBACK' ? 'How you rated a rescue' : 'Your rescue choice',
          sourceEventKey: `test:${ingredient}:${i}`,
        }),
      );
    }
    await Promise.all(jobs);
  };

  beforeEach(() => {
    for (const table of Object.keys(store.rows)) delete store.rows[table];
  });

  it('three explicit ratings make an ESTABLISHED pattern', async () => {
    await addLive({ ingredient: 'kale', count: 3, polarity: 'positive', source: 'EXPLICIT_FEEDBACK' });
    const journalOf = await journal.getJournal(u);
    const kale = journalOf.patterns.find((p) => p.value === 'kale');
    expect(kale).toBeDefined();
    expect(kale!.kind).toBe('pattern');
    expect(kale!.evidenceCount).toBe(3);
  });

  it('replaying the same event is idempotent (dedupe key)', async () => {
    const id = randomUUID();
    const args = {
      userId: u,
      dimension: 'ingredient' as const,
      value: 'oregano',
      polarity: 'positive' as const,
      source: 'EXPLICIT_FEEDBACK' as const,
      sourceEventKey: `event:${id}`,
      eventId: id,
    };
    const first = await journal.addSignal({ ...args });
    const second = await journal.addSignal({ ...args });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const patterns = await journal.getPatterns(u);
    const ore = patterns.find((p) => p.value === 'oregano');
    expect(ore).toBeDefined();
    expect(ore!.evidenceCount).toBe(1);

    const detail = await journal.getEvidence(u, 'STRAND:ingredient:oregano');
    expect(detail.evidence).toHaveLength(1);
  });

  it('backfill mirrors taste memory, taste events, and addition picks once', async () => {
    store.insert('TasteMemory', {
      userId: u,
      contextType: 'cuisine_family',
      contextValue: 'italian',
      affinity: 0.9,
      confidence: 1,
      ingredient: 'italian',
      lastUpdated: new Date(),
    });
    store.insert('TasteEvent', {
      userId: u,
      eventType: 'SATISFACTION_NAILED',
      targetType: 'ingredient',
      targetId: 'kale',
      createdAt: new Date(),
    });
    store.insert('AdditionEvent', {
      userId: u,
      selected: 'A',
      additionA: 'peanuts',
      additionB: 'cheese',
      createdAt: new Date(),
    });

    const before = await journal.getJournal(u);
    const italianWorks = before.boundaries
      .find((b) => b.group === 'USUALLY_WORKS')!
      .items.some((i) => i.value === 'italian');
    expect(italianWorks).toBe(true);
    const peanutsLearned = before.stillLearning.some((i) => i.value === 'peanuts');
    expect(peanutsLearned).toBe(true);

    const metaRows = store.all('TasteJournalMeta', { userId: u });
    expect(metaRows).toHaveLength(1);

    // Second read: the meta marker is set, so no re-scan doubling happens.
    const after = await journal.getJournal(u);
    expect(after.summary.totalSignals).toBe(before.summary.totalSignals);
    const kaleDetail = await journal.getEvidence(u, 'STRAND:ingredient:kale');
    expect(kaleDetail.evidence).toHaveLength(1);
  });

  it('explicit cuisine boundary appears without any behavioral evidence', async () => {
    // Only an onboarding taste-memory row exists - no taste_signals row at all.
    store.insert('TasteMemory', {
      userId: u,
      contextType: 'cuisine_family',
      contextValue: 'mexican',
      affinity: 0.9,
      confidence: 1,
      ingredient: 'mexican',
      lastUpdated: new Date(),
    });
    const journalOf = await journal.getJournal(u);
    const works = journalOf.boundaries.find((b) => b.group === 'USUALLY_WORKS')!.items;
    expect(works.some((i) => i.value === 'mexican')).toBe(true);
    const mexican = works.find((i) => i.value === 'mexican')!;
    expect(mexican.body).toContain('You told us');
  });

  it('dismiss hides an insight everywhere - boundaries included', async () => {
    await addLive({ ingredient: 'cilantro', count: 3, polarity: 'negative' });
    let journalOf = await journal.getJournal(u);
    expect(
      journalOf.boundaries.find((b) => b.group === 'USUALLY_AVOID')!.items.some((i) => i.value === 'cilantro'),
    ).toBe(true);

    await journal.override(u, 'STRAND:ingredient:cilantro', { action: 'DISMISS' });
    journalOf = await journal.getJournal(u);
    const avoid = journalOf.boundaries.find((b) => b.group === 'USUALLY_AVOID')!.items;
    expect(avoid.some((i) => i.value === 'cilantro')).toBe(false);
    expect(journalOf.stillLearning.some((i) => i.value === 'cilantro')).toBe(false);

    await expect(journal.getEvidence(u, 'STRAND:ingredient:cilantro')).rejects.toThrow(AppError);
  });

  it('forget removes the strand and its evidence, then a real signal revives it', async () => {
    await addLive({ ingredient: 'tripe', count: 3, polarity: 'negative' });
    await journal.override(u, 'STRAND:ingredient:tripe', { action: 'FORGET' });

    const forgottenJournal = await journal.getJournal(u);
    expect(
      forgottenJournal.boundaries.find((b) => b.group === 'USUALLY_AVOID')!.items.some((i) => i.value === 'tripe'),
    ).toBe(false);
    expect(forgottenJournal.patterns.some((i) => i.value === 'tripe')).toBe(false);

    // FORGOTTEN means backfill must not reinstate it (idempotent addSignal no-ops).
    store.insert('TasteEvent', {
      userId: u,
      eventType: 'RESCUE_REJECTED',
      targetType: 'ingredient',
      targetId: 'tripe',
      createdAt: new Date(),
    });
    await journal.getJournal(u);
    const afterBackfill = await journal.getJournal(u);
    expect(afterBackfill.patterns.some((i) => i.value === 'tripe')).toBe(false);

    // A genuinely new live signal is not backfill, so it revives the strand.
    await addLive({ ingredient: 'tripe', count: 1, polarity: 'negative' });
    const revived = await journal.getJournal(u);
    // A single fresh signal is EMERGING: it is learned again and surfaced,
    // though as still learning rather than an established avoid.
    expect(revived.stillLearning.some((i) => i.value === 'tripe')).toBe(true);
    expect(revived.boundaries.every((b) => !b.items.some((i) => i.value === 'tripe'))).toBe(true);
  });

  it('correct moves a strand between boundary columns', async () => {
    await addLive({ ingredient: 'mushy', count: 3, polarity: 'negative' });
    let journalOf = await journal.getJournal(u);
    const avoidItems = journalOf.boundaries.find((b) => b.group === 'USUALLY_AVOID')!.items;
    expect(avoidItems.some((i) => i.value === 'mushy')).toBe(true);

    await journal.override(u, 'STRAND:ingredient:mushy', {
      action: 'CORRECT',
      correctedPolarity: 'positive',
    });
    journalOf = await journal.getJournal(u);
    const worksItems = journalOf.boundaries.find((b) => b.group === 'USUALLY_WORKS')!.items;
    const newAvoid = journalOf.boundaries.find((b) => b.group === 'USUALLY_AVOID')!.items;
    expect(worksItems.some((i) => i.value === 'mushy')).toBe(true);
    expect(newAvoid.some((i) => i.value === 'mushy')).toBe(false);
  });

  it('evidence trail is raw and attributable', async () => {
    await addLive({ ingredient: 'basil', count: 2, polarity: 'positive', source: 'EXPLICIT_FEEDBACK' });
    const detail = await journal.getEvidence(u, 'STRAND:ingredient:basil');
    expect(detail.evidence).toHaveLength(2);
    for (const e of detail.evidence) {
      expect(e.source).toBe('EXPLICIT_FEEDBACK');
      expect(e.sourceLabel).toBe('How you rated a rescue');
      expect(new Date(e.occurredAt).getTime()).toBeGreaterThan(0);
    }
  });

  it('correcting requires a real direction', async () => {
    await expect(
      journal.override(u, 'STRAND:ingredient:basil', { action: 'CORRECT' }),
    ).rejects.toThrow(AppError);
  });
});