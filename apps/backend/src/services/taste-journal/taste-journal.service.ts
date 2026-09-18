import type {
  TasteBoundaryGroup,
  TasteJournal,
  TasteJournalEvidenceDetail,
  TasteJournalInsight,
  TasteJournalOverrideAction,
  TasteJournalOverrideRequest,
  TasteJournalOverrideResponse,
  TasteJournalSummary,
  TasteSignal,
  TasteSignalEvidence,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError } from '../../lib/errors';
import { TasteMemoryService } from '../taste-memory.service';
import { ContextualPatternService } from './contextual-pattern.service';
import { PreferenceAggregationService, parseStrandId, strandId } from './preference-aggregation.service';
import { TasteInsightService } from './taste-insight.service';
import { TasteSignalService } from './taste-signal.service';
import type { AddSignalArgs } from './taste-signal.service';

const HIDDEN_OVERRIDES: TasteJournalOverrideAction[] = ['DISMISSED', 'FORGOTTEN'];

/**
 * TasteJournalService - the reader-facing face of the journal.
 *
 * Orchestrates evidence (signals) -> landscape (aggregation) -> editorial
 * copy (templates) -> user-adjusted presentation (overrides). This is the
 * only service routes talk to for the journal screen.
 */
export class TasteJournalService {
  private readonly signals: TasteSignalService;
  private readonly aggregation: PreferenceAggregationService;
  private readonly contextual: ContextualPatternService;
  private readonly insights: TasteInsightService;
  private readonly tasteMemory: TasteMemoryService;

  constructor(private readonly models: Db['models']) {
    this.signals = new TasteSignalService(models);
    this.aggregation = new PreferenceAggregationService();
    this.contextual = new ContextualPatternService();
    this.insights = new TasteInsightService();
    this.tasteMemory = new TasteMemoryService(models);
  }

  // -------------------------------------------------------------------------
  // Signal recording (used by producers)
  // -------------------------------------------------------------------------

  addSignal(args: AddSignalArgs) {
    return this.signals.addSignal(args);
  }

  async backfillOnce(userId: string): Promise<{ signalsCreated: number; evidenceCreated: number }> {
    return this.backfill(userId);
  }

  // -------------------------------------------------------------------------
  // Journal sections
  // -------------------------------------------------------------------------

  async getJournal(userId: string): Promise<TasteJournal> {
    const [signals, overrides] = await this.loadState(userId);
    const visible = this.applyOverridesToSignals(signals, overrides);
    const landscape = this.aggregation.buildLandscape(userId, visible);

    return {
      summary: this.buildSummary(landscape.active),
      progress: landscape.emerging.map((s) =>
        this.insights.renderProgressive(this.withCorrection(s, overrides)),
      ),
      patterns: landscape.patterns.map((s) =>
        this.insights.renderPattern(this.withCorrection(s, overrides)),
      ),
      dependentPatterns: this.contextual
        .buildDependentPatterns(visible, 3)
        .map((dep) => this.insights.renderDependent(dep)),
      discoveries: landscape.discoveries.map((s) =>
        this.insights.renderDiscovery(this.withCorrection(s, overrides)),
      ),
      stillLearning: landscape.stillLearning.map((s) =>
        this.insights.renderStillLearning(this.withCorrection(s, overrides)),
      ),
      boundaries: await this.buildBoundaries(userId, landscape.patterns, landscape.avoidances, landscape.contextual, overrides),
    };
  }

  async getSummary(userId: string): Promise<TasteJournalSummary> {
    const [signals, overrides] = await this.loadState(userId);
    const visible = this.applyOverridesToSignals(signals, overrides);
    const landscape = this.aggregation.buildLandscape(userId, visible);
    return this.buildSummary(landscape.active);
  }

  async getPatterns(userId: string): Promise<TasteJournalInsight[]> {
    const { landscape, overrides } = await this.buildLandscape(userId);
    return landscape.patterns.map((s) => this.insights.renderPattern(this.withCorrection(s, overrides)));
  }

  async getDependentPatterns(userId: string): Promise<TasteJournalInsight[]> {
    const [, , visible] = await this.loadState(userId);
    return this.contextual
      .buildDependentPatterns(visible, 3)
      .map((dep) => this.insights.renderDependent(dep));
  }

  async getDiscoveries(userId: string): Promise<TasteJournalInsight[]> {
    const { landscape, overrides } = await this.buildLandscape(userId);
    return landscape.discoveries.map((s) =>
      this.insights.renderDiscovery(this.withCorrection(s, overrides)),
    );
  }

  async getStillLearning(userId: string): Promise<TasteJournalInsight[]> {
    const { landscape, overrides } = await this.buildLandscape(userId);
    return landscape.stillLearning.map((s) =>
      this.insights.renderStillLearning(this.withCorrection(s, overrides)),
    );
  }

  async getBoundaries(userId: string): Promise<TasteBoundaryGroup[]> {
    const { landscape, overrides } = await this.buildLandscape(userId);
    return this.buildBoundaries(
      userId,
      landscape.patterns,
      landscape.avoidances,
      landscape.contextual,
      overrides,
    );
  }

  // -------------------------------------------------------------------------
  // Evidence transparency
  // -------------------------------------------------------------------------

  async getEvidence(userId: string, insightId: string): Promise<TasteJournalEvidenceDetail> {
    const { dimension, value } = this.resolveInsightId(insightId);
    const signal = await this.signals.getSignal(userId, dimension, value);
    if (!signal || signal.status === 'DISMISSED') {
      throw AppError.notFound('Insight');
    }
    const evidence = await this.signals.getEvidence(userId, dimension, value);
    return {
      insightId: strandId(dimension, value),
      dimension: signal.dimension,
      value: signal.value,
      polarity: signal.polarity,
      confidence: signal.confidence,
      status: signal.status,
      evidenceCount: signal.evidenceCount,
      positiveCount: signal.positiveCount,
      negativeCount: signal.negativeCount,
      neutralCount: signal.neutralCount,
      sourceTypes: signal.sourceTypes,
      contexts: signal.contexts ?? [],
      evidence: evidence.map(toEvidenceResponse),
    };
  }

  // -------------------------------------------------------------------------
  // User controls
  // -------------------------------------------------------------------------

  async override(
    userId: string,
    insightId: string,
    request: TasteJournalOverrideRequest,
  ): Promise<TasteJournalOverrideResponse> {
    const { dimension, value } = this.resolveInsightId(insightId);
    const action: TasteJournalOverrideAction =
      request.action === 'DISMISS' ? 'DISMISSED' : request.action === 'CORRECT' ? 'CORRECTED' : 'FORGOTTEN';

    if (action === 'CORRECTED') {
      if (request.correctedPolarity !== 'positive' && request.correctedPolarity !== 'negative') {
        throw AppError.badRequest('INVALID_CORRECTION', 'correctedPolarity must be positive or negative');
      }
    }

    const key = strandId(dimension, value);
    const existing = await this.models.TasteInsightOverride.findOne({
      where: { userId, insightKey: key },
    });
    if (existing) {
      await existing.update({
        action,
        note: request.note ?? null,
        correctedPolarity:
          action === 'CORRECTED' ? (request.correctedPolarity ?? null) : null,
      });
    } else {
      await this.models.TasteInsightOverride.create({
        userId,
        insightKey: key,
        action,
        note: request.note ?? null,
        correctedPolarity:
          action === 'CORRECTED' ? (request.correctedPolarity ?? null) : null,
      });
    }

    const signal = await this.signals.getSignal(userId, dimension, value);
    if (signal) {
      if (action === 'FORGOTTEN') {
        // Wipe the strand and its evidence; a brand-new real signal later re-learns it.
        await this.models.TasteSignal.destroy({ where: { id: signal.id } });
      } else if (action === 'DISMISSED') {
        await this.signals.markDismissed(userId, dimension, value);
      }
    }

    return { success: true, insightId: key, action };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async loadState(
    userId: string,
  ): Promise<[TasteSignal[], Map<string, ModelOverride>, TasteSignal[]]> {
    await this.backfillOnce(userId);
    const [signals, overrideRows] = await Promise.all([
      this.signals.getSignals(userId),
      this.models.TasteInsightOverride.findAll({ where: { userId } }),
    ]);
    const overrides = new Map<string, ModelOverride>();
    for (const row of overrideRows) {
      overrides.set(row.insightKey, {
        action: row.action,
        note: row.note ?? undefined,
        correctedPolarity: row.correctedPolarity ?? undefined,
        correctedValue: row.correctedValue ?? undefined,
      });
    }
    return [signals, overrides, this.applyOverridesToSignals(signals, overrides)];
  }

  private async buildLandscape(userId: string) {
    const [signals, overrides, visible] = await this.loadState(userId);
    return {
      landscape: this.aggregation.buildLandscape(userId, visible),
      overrides,
      visible,
    };
  }

  private applyOverridesToSignals(
    signals: TasteSignal[],
    overrides: Map<string, ModelOverride>,
  ): TasteSignal[] {
    return signals.filter((s) => {
      const override = overrides.get(strandId(s.dimension, s.value));
      return !(override && HIDDEN_OVERRIDES.includes(override.action));
    });
  }

  private withCorrection(signal: TasteSignal, overrides: Map<string, ModelOverride>): TasteSignal {
    const override = overrides.get(strandId(signal.dimension, signal.value));
    if (!override || override.action !== 'CORRECTED') return signal;
    return {
      ...signal,
      polarity: override.correctedPolarity ?? signal.polarity,
      value: override.correctedValue ?? signal.value,
    };
  }

  private buildSummary(active: TasteSignal[]): TasteJournalSummary {
    const lastActiveAt =
      active.length > 0
        ? new Date(
            Math.max(...active.map((s) => new Date(s.lastObservedAt).getTime())),
          ).toISOString()
        : null;
    const establishedCount = active.filter(
      (s) => s.status === 'ESTABLISHED' || s.status === 'EXPLICIT' || s.status === 'CONTEXTUAL',
    ).length;
    const staleThreshold = 60 * 24 * 60 * 60 * 1000;
    return {
      totalSignals: active.length,
      establishedCount,
      patternsCount: active.filter((s) => s.status === 'ESTABLISHED' || s.status === 'EXPLICIT').length,
      boundariesCount: 0,
      lastActiveAt,
      freshness:
        lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() <= staleThreshold
          ? 'fresh'
          : 'stale',
    };
  }

  private async buildBoundaries(
    userId: string,
    patterns: TasteSignal[],
    avoidances: TasteSignal[],
    contextual: TasteSignal[],
    overrides: Map<string, ModelOverride>,
  ): Promise<TasteBoundaryGroup[]> {
    // Explicit onboarding cuisines ("you told us") are always USUALLY_WORKS.
    const cuisineAffinities = await this.tasteMemory.getCuisineAffinities(userId);
    const worksCuisines = new Set<string>();
    const avoidCuisines = new Set<string>();
    for (const [family, affinity] of cuisineAffinities) {
      if (affinity >= 0.5) worksCuisines.add(family);
      else if (affinity <= -0.4) avoidCuisines.add(family);
    }

    const works: TasteJournalInsight[] = [];
    const seenWorks = new Set<string>();
    for (const family of worksCuisines) {
      const id = strandId('cuisine', family);
      if (seenWorks.has(id)) continue;
      seenWorks.add(id);
      const strand = patterns.find((s) => s.dimension === 'cuisine' && s.value === family);
      works.push(
        strand
          ? this.insights.renderBoundary(this.withCorrection(strand, overrides))
          : this.insights.renderExplicitCuisineBoundary(family),
      );
    }
    for (const signal of patterns) {
      if (signal.dimension === 'cuisine') continue;
      const id = strandId(signal.dimension, signal.value);
      if (seenWorks.has(id) || signal.polarity === 'negative') continue;
      seenWorks.add(id);
      works.push(this.insights.renderBoundary(this.withCorrection(signal, overrides)));
    }

    const avoid: TasteJournalInsight[] = [];
    const seenAvoid = new Set<string>();
    for (const family of avoidCuisines) {
      const id = strandId('cuisine', family);
      if (seenAvoid.has(id)) continue;
      seenAvoid.add(id);
      const strand = avoidances.find((s) => s.dimension === 'cuisine' && s.value === family);
      if (strand) {
        avoid.push(this.insights.renderBoundary(this.withCorrection(strand, overrides)));
      } else {
        const signal: TasteSignal = {
          id,
          userId,
          dimension: 'cuisine',
          value: family,
          polarity: 'negative',
          confidence: 0.6,
          status: 'ESTABLISHED',
          evidenceCount: 1,
          positiveCount: 0,
          negativeCount: 1,
          neutralCount: 0,
          sourceTypes: ['ONBOARDING'],
          primarySourceType: 'ONBOARDING',
          contexts: [],
          firstObservedAt: new Date().toISOString(),
          lastObservedAt: new Date().toISOString(),
        };
        avoid.push(this.insights.renderBoundary(signal));
      }
    }

    for (const signal of avoidances) {
      const id = strandId(signal.dimension, signal.value);
      if (seenAvoid.has(id)) continue;
      seenAvoid.add(id);
      avoid.push(this.insights.renderBoundary(this.withCorrection(signal, overrides)));
    }

    const depends = contextual.map((s) =>
      this.insights.renderContextual(this.withCorrection(s, overrides)),
    );

    return [
      {
        group: 'USUALLY_WORKS',
        title: 'Usually works',
        subtitle: 'What reliably lands for you.',
        items: works.slice(0, 6),
      },
      {
        group: 'DEPENDS',
        title: 'Depends',
        subtitle: 'Where the context decides.',
        items: depends.slice(0, 4),
      },
      {
        group: 'USUALLY_AVOID',
        title: 'Usually avoid',
        subtitle: 'Clear no-goes, backed by evidence.',
        items: avoid.slice(0, 6),
      },
    ];
  }

  private resolveInsightId(insightId: string): { dimension: string; value: string } {
    const parsed = parseStrandId(insightId);
    if (!parsed) {
      throw AppError.badRequest('INVALID_INSIGHT_ID', `Unknown insight id '${insightId}'`);
    }
    return parsed;
  }

  // -------------------------------------------------------------------------
  // Backfill from historical tables (idempotent, one-time)
  // -------------------------------------------------------------------------

  private async backfill(
    userId: string,
  ): Promise<{ signalsCreated: number; evidenceCreated: number }> {
    const meta = await this.models.TasteJournalMeta.findOne({ where: { userId } });
    if (meta) {
      return { signalsCreated: 0, evidenceCreated: 0 };
    }

    let evidenceCreated = 0;

    // (a) Explicit cuisines from the onboarding compass.
    const tasteMemories = await this.models.TasteMemory.findAll({ where: { userId } });
    for (const row of tasteMemories) {
      const data = row.get() as { contextType: string; contextValue: string; affinity: number };
      if (data.contextType !== 'cuisine_family') continue;
      const affinity = Number(data.affinity);
      if (affinity >= 0.4 || affinity <= -0.4) {
        await this.signals.addSignal({
          userId,
          dimension: 'cuisine',
          value: data.contextValue,
          polarity: affinity >= 0.4 ? 'positive' : 'negative',
          source: 'ONBOARDING',
          sourceLabel: 'What you told us during setup',
          sourceEventKey: `onboardingcuisine:${data.contextValue}`,
          occurredAt: new Date(),
          backfill: true,
        });
        evidenceCreated += 1;
      }
    }

    // (b) Immutable taste event log (decisions + satisfaction feedback).
    const events = await this.models.TasteEvent.findAll({
      where: { userId },
      order: [['createdAt', 'ASC']],
    });
    for (const event of events) {
      const m = event as unknown as {
        id: string;
        eventType: string;
        targetType: string;
        targetId: string;
        createdAt: Date;
      };
      if (m.targetType !== 'ingredient') continue;
      const mapped = mapEventType(m.eventType);
      if (!mapped) continue;
      await this.signals.addSignal({
        userId,
        dimension: 'ingredient',
        value: m.targetId,
        polarity: mapped.polarity,
        source: mapped.source,
        sourceLabel: mapped.sourceLabel,
        eventId: m.id,
        sourceEventKey: `event:${m.id}`,
        occurredAt: m.createdAt,
        backfill: true,
      });
      evidenceCreated += 1;
    }

    // (c) Onboarding addition picks (cold-start "finish the meal" pairs).
    const additions = await this.models.AdditionEvent.findAll({ where: { userId } });
    for (const a of additions) {
      const data = a.get() as {
        id: string;
        selected: 'A' | 'B' | null;
        additionA: string;
        additionB: string;
        createdAt: Date;
      };
      if (!data.selected) continue;
      const chosen = data.selected === 'A' ? data.additionA : data.additionB;
      await this.signals.addSignal({
        userId,
        dimension: 'ingredient',
        value: chosen,
        polarity: 'positive',
        source: 'ONBOARDING',
        sourceLabel: 'What you picked during setup',
        sourceEventKey: `onboarding:${data.id}`,
        occurredAt: data.createdAt,
        backfill: true,
      });
      evidenceCreated += 1;
    }

    return { signalsCreated: 0, evidenceCreated };
  }
}

interface ModelOverride {
  action: TasteJournalOverrideAction;
  note?: string;
  correctedPolarity?: 'positive' | 'negative';
  correctedValue?: string;
}

function toEvidenceResponse(row: TasteSignalEvidence): TasteJournalEvidenceDetail['evidence'][number] {
  return {
    source: row.source,
    sourceLabel: row.sourceLabel,
    polarity: row.polarity,
    eventId: row.eventId ?? undefined,
    context:
      row.contextType && row.contextValue
        ? {
            contextType: row.contextType,
            contextValue: row.contextValue,
            count: 1,
            share: 0,
            polarity: row.polarity === 'neutral' ? 'neutral' : row.polarity,
          }
        : undefined,
    note: row.note ?? undefined,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function mapEventType(
  eventType: string,
):
  | {
      polarity: 'positive' | 'negative' | 'neutral';
      source: 'BEHAVIOR' | 'EXPLICIT_FEEDBACK';
      sourceLabel: string;
    }
  | null {
  switch (eventType) {
    case 'SATISFACTION_NAILED':
      return { polarity: 'positive', source: 'EXPLICIT_FEEDBACK', sourceLabel: 'How you rated a rescue' };
    case 'SATISFACTION_ALMOST':
      return { polarity: 'neutral', source: 'EXPLICIT_FEEDBACK', sourceLabel: 'How you rated a rescue' };
    case 'SATISFACTION_NOT_FOR_ME':
      return { polarity: 'negative', source: 'EXPLICIT_FEEDBACK', sourceLabel: 'How you rated a rescue' };
    case 'RESCUE_ACCEPTED':
      return { polarity: 'positive', source: 'BEHAVIOR', sourceLabel: 'A rescue you accepted' };
    case 'RESCUE_REJECTED':
      return { polarity: 'negative', source: 'BEHAVIOR', sourceLabel: 'A rescue you passed on' };
    case 'RESCUE_SWAPPED':
      return { polarity: 'neutral', source: 'BEHAVIOR', sourceLabel: 'A rescue you swapped' };
    default:
      return null;
  }
}