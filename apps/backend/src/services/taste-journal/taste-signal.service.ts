import { randomUUID } from 'node:crypto';

import type {
  TasteSignal,
  TasteSignalContext,
  TasteSignalPolarity,
  TasteSignalSource,
  TasteSignalStatus,
} from '@meal-rescue/shared-types';

import { tasteJournalConfig } from '../../config/taste-journal';
import type { Db } from '../../database/models';
import type { TasteSignalEvidence as TasteSignalEvidenceRow } from '../../database/models/taste-signal-evidence.model';

export interface AddSignalArgs {
  userId: string;
  dimension: TasteSignal['dimension'];
  value: string;
  polarity: 'positive' | 'negative' | 'neutral';
  source: TasteSignalSource;
  /** Human-friendly attribution, e.g. "You told us during setup". */
  sourceLabel?: string;
  /** Originating immutable event id, when this signal mirrors one. */
  eventId?: string;
  /**
   * Idempotency token. Always set it for non-event producers (e.g. an
   * onboarding pair) so replays never double-count. When unset the service
   * generates a unique key, which means that call is NOT idempotent.
   */
  sourceEventKey?: string;
  contextType?: string;
  contextValue?: string;
  /** Plain-language note for the "why this?" screen. */
  note?: string;
  occurredAt?: Date;
  /** Down-weight historical backfill (e.g. 0.5). Live signals default to 1. */
  evidenceWeightFactor?: number;
  /**
   * True when this signal comes from the historical backfill, not a fresh
   * user action. Backfill never revives a forgotten strand.
   */
  backfill?: boolean;
}

export interface AddSignalResult {
  created: boolean;
  signal: TasteSignal;
}

/** Pure computation helpers - exported so aggregation logic is unit-testable. */

interface EvidencePiece {
  polarity: 'positive' | 'negative' | 'neutral';
  source: TasteSignalSource;
  weight: number;
  contextType?: string | null;
  contextValue?: string | null;
  occurredAt: Date;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic confidence. Grows with evidence mass, penalised by lack of
 * agreement and share of neutral evidence. Never reaches 1 - the journal
 * always leaves room for the user to change.
 */
export function computeConfidence(pieces: EvidencePiece[]): number {
  if (pieces.length === 0) return 0;
  let totalWeight = 0;
  let posWeight = 0;
  let negWeight = 0;
  let neuWeight = 0;
  for (const p of pieces) {
    totalWeight += p.weight;
    if (p.polarity === 'positive') posWeight += p.weight;
    else if (p.polarity === 'negative') negWeight += p.weight;
    else neuWeight += p.weight;
  }
  const posShare = totalWeight > 0 ? posWeight / totalWeight : 0;
  const negShare = totalWeight > 0 ? negWeight / totalWeight : 0;
  const neuShare = totalWeight > 0 ? neuWeight / totalWeight : 0;
  const clarity = posShare + negShare;
  const agreement = Math.max(posShare, negShare);
  return round2(clamp01((1 - 1 / (1 + totalWeight)) * clarity * agreement) * (1 - neuShare * 0.5));
}

export function computePolarity(pieces: EvidencePiece[]): TasteSignalPolarity {
  if (pieces.length === 0) return 'neutral';
  let posWeight = 0;
  let negWeight = 0;
  let totalWeight = 0;
  for (const p of pieces) {
    totalWeight += p.weight;
    if (p.polarity === 'positive') posWeight += p.weight;
    else if (p.polarity === 'negative') negWeight += p.weight;
  }
  const posShare = totalWeight > 0 ? posWeight / totalWeight : 0;
  const negShare = totalWeight > 0 ? negWeight / totalWeight : 0;
  if (
    posShare >= tasteJournalConfig.CONFLICT_MINORITY_SHARE &&
    negShare >= tasteJournalConfig.CONFLICT_MINORITY_SHARE
  ) {
    return 'mixed';
  }
  if (posShare >= tasteJournalConfig.POLARITY_MAJORITY_SHARE) return 'positive';
  if (negShare >= tasteJournalConfig.POLARITY_MAJORITY_SHARE) return 'negative';
  return 'neutral';
}

export function computeStatus(
  pieces: EvidencePiece[],
  confidence: number,
): TasteSignalStatus {
  const total = pieces.length;
  if (total === 0) return 'UNKNOWN';

  let posWeight = 0;
  let negWeight = 0;
  let totalWeight = 0;
  let explicitWeight = 0;
  for (const p of pieces) {
    totalWeight += p.weight;
    if (p.polarity === 'positive') posWeight += p.weight;
    else if (p.polarity === 'negative') negWeight += p.weight;
    if (p.source === 'EXPLICIT_FEEDBACK') explicitWeight += p.weight;
  }
  const posShare = posWeight / totalWeight;
  const negShare = negWeight / totalWeight;

  if (
    posShare >= tasteJournalConfig.CONFLICT_MINORITY_SHARE &&
    negShare >= tasteJournalConfig.CONFLICT_MINORITY_SHARE
  ) {
    return 'CONFLICTED';
  }
  if (
    explicitWeight > 0 &&
    Math.max(posShare, negShare) >= tasteJournalConfig.POLARITY_MAJORITY_SHARE
  ) {
    return 'EXPLICIT';
  }

  const topContext = topContextShare(pieces);
  if (
    total >= 2 &&
    topContext.share >= tasteJournalConfig.CONTEXTUAL_PREFIX_SHARE &&
    topContext.count >= 2
  ) {
    return 'CONTEXTUAL';
  }
  if (
    total >= tasteJournalConfig.MIN_EVIDENCE_ESTABLISHED &&
    confidence >= tasteJournalConfig.ESTABLISHED_CONFIDENCE
  ) {
    return 'ESTABLISHED';
  }
  if (total >= tasteJournalConfig.MIN_EVIDENCE_EMERGING) return 'EMERGING';
  return 'UNKNOWN';
}

function topContextShare(pieces: EvidencePiece[]): { contextType: string; contextValue: string; share: number; count: number } {
  const buckets = new Map<string, { contextType: string; contextValue: string; count: number }>();
  for (const p of pieces) {
    const key = `${p.contextType ?? 'global'}:${p.contextValue ?? 'overall'}`;
    const existing = buckets.get(key) ?? {
      contextType: p.contextType ?? 'global',
      contextValue: p.contextValue ?? 'overall',
      count: 0,
    };
    existing.count += 1;
    buckets.set(key, existing);
  }
  let top: { contextType: string; contextValue: string; count: number } | null = null;
  for (const b of buckets.values()) {
    if (!top || b.count > top.count) top = b;
  }
  return {
    contextType: top?.contextType ?? 'global',
    contextValue: top?.contextValue ?? 'overall',
    count: top?.count ?? 0,
    share: pieces.length > 0 ? (top?.count ?? 0) / pieces.length : 0,
  };
}

const SOURCE_LABELS: Record<TasteSignalSource, string> = {
  ONBOARDING: 'What you told us during setup',
  EXPLICIT_FEEDBACK: 'How you rated a rescue',
  BEHAVIOR: 'The choices you made in a rescue',
  SYSTEM_INFERENCE: 'Patterns drawn from your history',
};

/**
 * TasteSignalService - records and maintains the journal's evidence strands.
 *
 * One (dimension, value) strand per user. Every add is app-level idempotent
 * via the evidence dedupe key, so backfills and replays are safe to run twice.
 */
export class TasteSignalService {
  constructor(private readonly models: Db['models']) {}

  async addSignal(args: AddSignalArgs): Promise<AddSignalResult> {
    const value = args.value.trim().toLowerCase();
    if (value.length === 0) {
      throw new Error('TasteSignalService: value must be non-empty');
    }
    const sourceEventKey =
      args.sourceEventKey ?? (args.eventId ? `event:${args.eventId}` : `${randomUUID()}`);
    const weight =
      (tasteJournalConfig.SOURCE_WEIGHTS[args.source] ?? 1) *
      (args.evidenceWeightFactor ?? 1);
    const occurredAt = args.occurredAt ?? new Date();

    const [signal] = await this.models.TasteSignal.findOrCreate({
      where: { userId: args.userId, dimension: args.dimension, value },
    });

    // A genuinely new user signal revives a forgotten strand; backfill never does.
    if (!args.backfill && args.source !== 'SYSTEM_INFERENCE') {
      await this.models.TasteInsightOverride.destroy({
        where: {
          userId: args.userId,
          insightKey: `STRAND:${args.dimension}:${value}`,
          action: 'FORGOTTEN',
        },
      });
    }

    const existingEvidence = await this.models.TasteSignalEvidence.findOne({
      where: { signalId: signal.id, sourceEventKey },
    });
    if (existingEvidence) {
      return {
        created: false,
        signal: this.toSignal(signal),
      };
    }

    try {
      await this.models.TasteSignalEvidence.create({
        id: randomUUID(),
        signalId: signal.id,
        userId: args.userId,
        dimension: args.dimension,
        value,
        polarity: args.polarity,
        source: args.source,
        sourceLabel: args.sourceLabel ?? SOURCE_LABELS[args.source],
        weight,
        eventId: args.eventId ?? null,
        sourceEventKey,
        contextType: args.contextType ?? null,
        contextValue: args.contextValue ?? null,
        note: args.note ?? null,
        occurredAt,
      });
    } catch (err) {
      // A concurrent writer won the unique (signal_id, source_event_key) race -
      // this datum is already recorded. App-level idempotency is preserved.
      if ((err as { name?: string }).name === 'SequelizeUniqueConstraintError') {
        return { created: false, signal: this.toSignal(signal) };
      }
      throw err;
    }

    await this.refreshSignal(args.userId, args.dimension, value);

    const refreshed = await this.getSignal(args.userId, args.dimension, value);
    return { created: true, signal: refreshed ?? this.toSignal(signal) };
  }

  async getSignals(userId: string): Promise<TasteSignal[]> {
    const rows = await this.models.TasteSignal.findAll({
      where: { userId },
      order: [['last_observed_at', 'DESC']],
    });
    return rows.map((r) => this.toSignal(r));
  }

  async getSignal(userId: string, dimension: string, value: string): Promise<TasteSignal | null> {
    const row = await this.models.TasteSignal.findOne({
      where: { userId, dimension, value: value.toLowerCase() },
    });
    return row ? this.toSignal(row) : null;
  }

  async getEvidence(
    userId: string,
    dimension: string,
    value: string,
  ): Promise<TasteSignalEvidenceRow[]> {
    return this.models.TasteSignalEvidence.findAll({
      where: { userId, dimension, value: value.toLowerCase() },
      order: [['occurred_at', 'DESC']],
    });
  }

  /** All evidence for a user, keyed by strand (dimension:value). For backfill planning. */
  async getEvidenceForUser(userId: string): Promise<Map<string, TasteSignalEvidenceRow[]>> {
    const rows = await this.models.TasteSignalEvidence.findAll({
      where: { userId },
      order: [['occurred_at', 'ASC']],
    });
    const map = new Map<string, TasteSignalEvidenceRow[]>();
    for (const r of rows) {
      const key = `${r.dimension}:${r.value}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }

  /**
   * Recount a strand from its evidence rows. Used by backfill after bulk
   * inserts when a per-signal recompute is cheaper than full re-emit.
   */
  async refreshSignal(userId: string, dimension: string, value: string): Promise<void> {
    const signal = await this.models.TasteSignal.findOne({
      where: { userId, dimension, value: value.toLowerCase() },
    });
    if (!signal) return;
    const all = await this.models.TasteSignalEvidence.findAll({
      where: { signalId: signal.id },
    });
    const pieces: EvidencePiece[] = all.map((e) => ({
      polarity: e.polarity,
      source: e.source,
      weight: Number(e.weight),
      contextType: e.contextType,
      contextValue: e.contextValue,
      occurredAt: e.occurredAt,
    }));
    const confidence = computeConfidence(pieces);
    const polarity = computePolarity(pieces);
    const status = computeStatus(pieces, confidence);
    const timestamps = all.map((e) => e.occurredAt.getTime());
    await signal.update({
      confidence,
      polarity,
      status,
      evidenceCount: all.length,
      positiveCount: all.filter((e) => e.polarity === 'positive').length,
      negativeCount: all.filter((e) => e.polarity === 'negative').length,
      neutralCount: all.filter((e) => e.polarity === 'neutral').length,
      sourceTypes: deriveSourceTypes(all),
      primarySourceType: derivePrimarySource(all),
      contexts: deriveContexts(all),
      firstObservedAt: new Date(Math.min(...timestamps)),
      lastObservedAt: new Date(Math.max(...timestamps)),
    });
  }

  /** Explicit "forget this" - hides the strand until genuinely new evidence arrives. */
  async markDismissed(userId: string, dimension: string, value: string): Promise<void> {
    const signal = await this.models.TasteSignal.findOne({
      where: { userId, dimension, value: value.toLowerCase() },
    });
    if (signal) {
      await signal.update({ status: 'DISMISSED' as TasteSignalStatus });
    }
  }

  private toSignal(row: {
    id: string;
    userId: string;
    dimension: TasteSignal['dimension'];
    value: string;
    polarity: TasteSignalPolarity;
    status: TasteSignalStatus;
    confidence: number;
    evidenceCount: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    sourceTypes: TasteSignalSource[];
    primarySourceType: TasteSignalSource;
    contexts: TasteSignalContext[] | null;
    firstObservedAt: Date;
    lastObservedAt: Date;
  }): TasteSignal {
    return {
      id: row.id,
      userId: row.userId,
      dimension: row.dimension,
      value: row.value,
      polarity: row.polarity,
      status: row.status,
      confidence: Number(row.confidence),
      evidenceCount: Number(row.evidenceCount),
      positiveCount: Number(row.positiveCount),
      negativeCount: Number(row.negativeCount),
      neutralCount: Number(row.neutralCount),
      sourceTypes: row.sourceTypes ?? [],
      primarySourceType: row.primarySourceType,
      contexts: row.contexts ?? [],
      firstObservedAt: row.firstObservedAt.toISOString(),
      lastObservedAt: row.lastObservedAt.toISOString(),
    };
  }
}

function deriveSourceTypes(
  rows: Array<{ source: TasteSignalSource }>,
): TasteSignalSource[] {
  const order = ['ONBOARDING', 'BEHAVIOR', 'EXPLICIT_FEEDBACK', 'SYSTEM_INFERENCE'] as const;
  const present = new Set(rows.map((r) => r.source));
  return order.filter((s) => present.has(s)).map((s) => s as TasteSignalSource);
}

function derivePrimarySource(
  rows: Array<{ source: TasteSignalSource }>,
): TasteSignalSource {
  const weights: Record<TasteSignalSource, number> = {
    ONBOARDING: 1,
    BEHAVIOR: 2,
    EXPLICIT_FEEDBACK: 3,
    SYSTEM_INFERENCE: 0.5,
  };
  let best: TasteSignalSource = rows[0]?.source ?? 'BEHAVIOR';
  let bestWeight = -1;
  for (const r of rows) {
    const w = weights[r.source];
    if (w > bestWeight) {
      bestWeight = w;
      best = r.source;
    }
  }
  return best;
}

function deriveContexts(
  rows: Array<{
    polarity: 'positive' | 'negative' | 'neutral';
    contextType: string | null;
    contextValue: string | null;
  }>,
): TasteSignalContext[] {
  const buckets = new Map<
    string,
    {
      contextType: string;
      contextValue: string;
      count: number;
      positive: number;
      negative: number;
      neutral: number;
    }
  >();
  for (const r of rows) {
    const key = `${r.contextType ?? 'global'}:${r.contextValue ?? 'overall'}`;
    const existing = buckets.get(key) ?? {
      contextType: r.contextType ?? 'global',
      contextValue: r.contextValue ?? 'overall',
      count: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
    };
    existing.count += 1;
    if (r.polarity === 'positive') existing.positive += 1;
    else if (r.polarity === 'negative') existing.negative += 1;
    else existing.neutral += 1;
    buckets.set(key, existing);
  }
  const total = rows.length;
  return [...buckets.values()]
    .map((b) => ({
      contextType: b.contextType,
      contextValue: b.contextValue,
      count: b.count,
      share: round2(b.count / total),
      polarity: bucketPolarity(b),
    }))
    .sort((a, b) => b.count - a.count);
}

function bucketPolarity(b: {
  positive: number;
  negative: number;
  neutral: number;
}): TasteSignalContext['polarity'] {
  const total = b.positive + b.negative + b.neutral;
  if (total === 0) return 'neutral';
  if (b.positive / total >= tasteJournalConfig.POLARITY_MAJORITY_SHARE) return 'positive';
  if (b.negative / total >= tasteJournalConfig.POLARITY_MAJORITY_SHARE) return 'negative';
  return 'neutral';
}