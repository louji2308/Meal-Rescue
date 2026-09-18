import type {
  TasteSignal,
  TasteSignalContext,
  TasteSignalPolarity,
} from '@meal-rescue/shared-types';

const CONTEXT_LABELS: Record<string, Record<string, string>> = {
  cuisine: {
    italian: 'Italian',
    indian: 'Indian',
    mexican: 'Mexican',
    east_asian: 'East Asian',
    mediterranean: 'Mediterranean',
    american: 'American',
    middle_eastern: 'Middle Eastern',
    african: 'African',
    caribbean: 'Caribbean',
    thai: 'Thai',
  },
  meal_time: { morning: 'the morning', lunch: 'lunch', dinner: 'dinner', late_night: 'late nights' },
  meal_group: {},
};

export interface SplitContext extends TasteSignalContext {
  label: string;
}

export interface DependentPattern {
  signal: TasteSignal;
  /** Two or more context buckets with opposing polarity. */
  split: SplitContext[];
}

function bucketLabel(contextType: string, contextValue: string): string {
  const label = CONTEXT_LABELS[contextType]?.[contextValue];
  if (label) return label;
  return contextValue.replace(/_/g, ' ');
}

/**
 * ContextualPatternService - finds "it depends" strands: the same factor
 * (e.g. spice) reads as a like in one context and a miss in another. Rendered
 * honestly - the journal shows both halves, never collapses them into a
 * blanket score.
 */
export class ContextualPatternService {
  buildDependentPatterns(
    signals: TasteSignal[],
    max = 3,
  ): DependentPattern[] {
    const results: DependentPattern[] = [];

    for (const signal of signals) {
      if (signal.status === 'DISMISSED' || signal.status === 'UNKNOWN') continue;
      const split = this.findSplitContexts(signal);
      if (split.length >= 2) {
        results.push({
          signal,
          split: split
            .map((c) => ({ ...c, label: bucketLabel(c.contextType, c.contextValue) }))
            .sort((a, b) => b.count - a.count),
        });
      }
    }

    results.sort((a, b) => b.signal.confidence - a.signal.confidence);
    return results.slice(0, max);
  }

  /** Contexts whose observed polarity disagrees with at least one other. */
  private findSplitContexts(signal: TasteSignal): TasteSignalContext[] {
    const buckets = (signal.contexts ?? []).filter((c) => c.count >= 2);
    if (buckets.length < 2) return [];
    const meaningful = buckets.filter(
      (c) => c.polarity === 'positive' || c.polarity === 'negative',
    );
    if (meaningful.length < 2) return [];
    const hasPositive = meaningful.some((c) => c.polarity === 'positive');
    const hasNegative = meaningful.some((c) => c.polarity === 'negative');
    if (!(hasPositive && hasNegative)) return [];
    return meaningful;
  }
}

export type { TasteSignalPolarity };