import type {
  TasteSignal,
  TasteSignalPolarity,
  TasteSignalSource,
  TasteSignalStatus,
} from '@meal-rescue/shared-types';

import { tasteJournalConfig } from '../../config/taste-journal';

/**
 * The intermediate shape the insight templates render from. No presentation
 * strings live here - just curated, evidence-backed strand selections.
 */
export interface TasteLandscape {
  /** Confident positives worth leading with (YOUR PATTERNS). */
  patterns: TasteSignal[];
  /** Confident negatives (feed USUALLY_AVOID). */
  avoidances: TasteSignal[];
  /** Lots of evidence pointing both ways. */
  conflicts: TasteSignal[];
  /** A preference clearly tied to one context (feeds IT DEPENDS). */
  contextual: TasteSignal[];
  /** Just barely being learned. */
  emerging: TasteSignal[];
  /** User-confirmed with explicit feedback. */
  explicit: TasteSignal[];
  /** Newly observed (first evidence within the recency window). */
  discoveries: TasteSignal[];
  /** Too thin or ambiguous to assert - for STILL LEARNING / PROGRESS. */
  stillLearning: TasteSignal[];
  /** Everything healthily active (for counts). */
  active: TasteSignal[];
}

export const strandId = (dimension: string, value: string): string =>
  `STRAND:${dimension}:${value.toLowerCase()}`;

export const parseStrandId = (id: string): { dimension: string; value: string } | null => {
  const match = /^STRAND:([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { dimension: match[1]!, value: match[2]! };
};

/**
 * PreferenceAggregationService - curates raw strands into the journal's
 * sections. Pure selection logic, fully deterministic: same evidence in,
 * same journal out.
 */
export class PreferenceAggregationService {
  buildLandscape(userId: string, signals: TasteSignal[]): TasteLandscape {
    const now = Date.now();
    const healthy = signals.filter((s) => this.isHealthy(s, now));

    const patterns: TasteSignal[] = [];
    const avoidances: TasteSignal[] = [];
    const conflicts: TasteSignal[] = [];
    const contextual: TasteSignal[] = [];
    const emerging: TasteSignal[] = [];
    const explicit: TasteSignal[] = [];
    const discoveries: TasteSignal[] = [];
    const stillLearning: TasteSignal[] = [];

    for (const signal of healthy) {
      const isCurrent =
        now - new Date(signal.lastObservedAt).getTime() <=
        tasteJournalConfig.STALENESS_DAYS * 24 * 60 * 60 * 1000;

      if (signal.status === 'CONFLICTED') {
        conflicts.push(signal);
        if (isCurrent && this.isInteresting(signal)) stillLearning.push(signal);
        continue;
      }

      if (signal.status === 'CONTEXTUAL') {
        contextual.push(signal);
        continue;
      }

      if (signal.status === 'EXPLICIT') {
        explicit.push(signal);
        if (signal.polarity === 'positive') patterns.push(signal);
        else avoidances.push(signal);
        continue;
      }

      if (signal.status === 'ESTABLISHED') {
        if (signal.polarity === 'positive') patterns.push(signal);
        else if (signal.polarity === 'negative') avoidances.push(signal);
        else stillLearning.push(signal);
        continue;
      }

      if (signal.status === 'EMERGING') {
        emerging.push(signal);
        if (this.isDiscovery(signal, now)) discoveries.push(signal);
        if (signal.polarity === 'neutral' || signal.evidenceCount < 2) {
          stillLearning.push(signal);
        }
        continue;
      }
    }

    const sortByConfidence = (a: TasteSignal, b: TasteSignal) => b.confidence - a.confidence;
    patterns.sort(sortByConfidence);
    avoidances.sort(sortByConfidence);
    conflicts.sort(sortByConfidence);
    contextual.sort(sortByConfidence);
    emerging.sort(sortByConfidence);
    explicit.sort(sortByConfidence);
    discoveries.sort(sortByConfidence);
    stillLearning.sort(sortByConfidence);

    return {
      patterns: patterns.slice(0, tasteJournalConfig.PATTERNS_MAX),
      avoidances: avoidances.slice(0, tasteJournalConfig.PATTERNS_MAX),
      conflicts: conflicts.slice(0, tasteJournalConfig.PATTERNS_MAX),
      contextual: contextual.slice(0, tasteJournalConfig.DEPENDENT_PATTERNS_MAX),
      emerging: emerging.slice(0, tasteJournalConfig.PATTERNS_MAX),
      explicit: explicit.slice(0, tasteJournalConfig.PATTERNS_MAX),
      discoveries: discoveries.slice(0, tasteJournalConfig.DISCOVERIES_MAX),
      stillLearning: stillLearning.slice(0, tasteJournalConfig.STILL_LEARNING_MAX),
      active: healthy,
    };
  }

  private isHealthy(signal: TasteSignal, now: number): boolean {
    if (signal.status === 'UNKNOWN') return false;
    if (signal.status === 'DISMISSED') return false;
    // Derived-only inferences go stale and stop being asserted.
    if (
      signal.primarySourceType === 'SYSTEM_INFERENCE' &&
      signal.sourceTypes.length === 1 &&
      now - new Date(signal.lastObservedAt).getTime() >
        tasteJournalConfig.INFERENCE_STALENESS_DAYS * 24 * 60 * 60 * 1000
    ) {
      return false;
    }
    return signal.confidence >= tasteJournalConfig.MIN_CONFIDENCE_SURFACE;
  }

  private isDiscovery(signal: TasteSignal, now: number): boolean {
    const ageDays =
      (now - new Date(signal.firstObservedAt).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays <= tasteJournalConfig.DISCOVERY_RECENCY_DAYS;
  }

  private isInteresting(signal: TasteSignal): boolean {
    return signal.polarity !== 'neutral' || signal.evidenceCount >= 2;
  }
}

export type { TasteSignalPolarity, TasteSignalSource, TasteSignalStatus };