import type { TasteJournalInsight, TasteSignal } from '@meal-rescue/shared-types';

import type { DependentPattern } from './contextual-pattern.service';
import { strandId } from './preference-aggregation.service';

/** Humanize a stored value like "east_asian" -> "east asian". */
export function humanize(value: string): string {
  const cleaned = value.trim().replace(/_/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const CUISINE_NAMES: Record<string, string> = {
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
};

export const cuisineName = (value: string): string => CUISINE_NAMES[value] ?? humanize(value);

interface TemplateCopy {
  title: string;
  body: string;
}

/**
 * TasteInsightService - turns curated strands into the journal's editorial
 * copy. Deterministic templates only: identical evidence always produces
 * identical copy. No LLM, no fabricated percentages.
 */
export class TasteInsightService {
  renderPattern(signal: TasteSignal): TasteJournalInsight {
    if (signal.polarity === 'negative') {
      return this.renderBoundary(signal);
    }
    const copy = positiveCopy(signal.dimension, signal.value);
    return this.base(signal, 'pattern', copy.title, copy.body);
  }

  renderProgressive(signal: TasteSignal): TasteJournalInsight {
    const copy = progressCopy(signal.dimension, signal.value);
    return this.base(signal, 'progress', copy.title, copy.body);
  }

  renderDiscovery(signal: TasteSignal): TasteJournalInsight {
    const copy = discoveryCopy(signal.dimension, signal.value);
    return this.base(signal, 'discovery', copy.title, copy.body);
  }

  renderStillLearning(signal: TasteSignal): TasteJournalInsight {
    const copy = stillLearningCopy(signal.dimension, signal.value);
    return this.base(signal, 'still_learning', copy.title, copy.body);
  }

  renderDependent(dep: DependentPattern): TasteJournalInsight {
    const { signal, split } = dep;
    const [left, right] = split;
    const leftLabel = left.label ?? left.contextValue.replace(/_/g, ' ');
    const rightLabel = right.label ?? right.contextValue.replace(/_/g, ' ');
    const signalCopy = dimensionNoun(signal.dimension, signal.value);

    const body =
      right?.polarity !== left?.polarity
        ? `It depends on the setting. ${signalCopy.title} works for you in ${rightLabel}, but lands differently in ${leftLabel}. We keep both halves separate.`
        : `${signalCopy.title} shows up in ${leftLabel} and ${rightLabel}.`;

    return {
      ...this.base(signal, 'dependent', `Depends: ${signalCopy.title.toLowerCase()}`, body),
      dimension: signal.dimension,
      value: signal.value,
    };
  }

  /**
   * Boundary item for an explicitly chosen cuisine (from onboarding) that may
   * not even have a signal strand yet. Elevated, clearly attributed.
   */
  renderExplicitCuisineBoundary(family: string): TasteJournalInsight {
    const name = cuisineName(family);
    return {
      id: strandId('cuisine', family),
      kind: 'boundary',
      title: name,
      body: `You told us ${name} fits how you like to eat.`,
      dimension: 'cuisine',
      value: family,
      polarity: 'positive',
      confidence: 1,
      evidenceCount: 1,
      sourceTypes: ['ONBOARDING'],
      contexts: [{ contextType: 'profile', contextValue: family, count: 1, share: 1, polarity: 'positive' }],
      lastObservedAt: new Date().toISOString(),
    };
  }

  renderBoundary(signal: TasteSignal): TasteJournalInsight {
    const name = signal.dimension === 'cuisine' ? cuisineName(signal.value) : humanize(signal.value);
    const noun = dimensionNoun(signal.dimension, signal.value).title;

    if (signal.polarity === 'negative') {
      return {
        ...this.base(
          signal,
          'boundary',
          `Usually avoid: ${name.toLowerCase()}`,
          `You've steered clear of ${noun.title} when it's been offered.`,
        ),
        title: `Usually avoid: ${name.toLowerCase()}`,
      };
    }
    return this.base(
      signal,
      'boundary',
      `Usually works: ${name.toLowerCase()}`,
      `${noun.title} has worked out for you more than a couple of times.`,
    );
  }

  /** Boundary-column item for a context-tied strand (DEPENDS group). */
  renderContextual(signal: TasteSignal): TasteJournalInsight {
    const name = signal.dimension === 'cuisine' ? cuisineName(signal.value) : humanize(signal.value);
    const top = signal.contexts?.[0];
    const contextNote = top
      ? ` especially in ${top.contextValue.replace(/_/g, ' ')}`
      : '';
    return {
      ...this.base(
        signal,
        'boundary',
        `Depends: ${name.toLowerCase()}`,
        `The picture around ${name.toLowerCase()} only makes sense in context${contextNote}.`,
      ),
      title: `Depends: ${name.toLowerCase()}`,
    };
  }

  private base(
    signal: TasteSignal,
    kind: TasteJournalInsight['kind'],
    title: string,
    body: string,
  ): TasteJournalInsight {
    return {
      id: strandId(signal.dimension, signal.value),
      kind,
      title,
      body,
      dimension: signal.dimension,
      value: signal.value,
      polarity: signal.polarity,
      confidence: signal.confidence,
      evidenceCount: signal.evidenceCount,
      sourceTypes: signal.sourceTypes,
      contexts: signal.contexts ?? [],
      lastObservedAt: signal.lastObservedAt,
    };
  }
}

function positiveCopy(dimension: TasteSignal['dimension'], value: string): TemplateCopy {
  const noun = dimensionNoun(dimension, value);
  switch (dimension) {
    case 'flavor':
      return {
        title: `Loves ${noun.title}`,
        body: `Something about ${noun.article} keeps winning you over.`,
      };
    case 'ingredient':
      return {
        title: `Favorite: ${noun.title}`,
        body: `Options built around ${noun.article} have worked out for you.`,
      };
    case 'cuisine':
      return {
        title: `Cooks with ${noun.title}`,
        body: `${noun.title} fits how you like to eat.`,
      };
    case 'texture':
    case 'temperature':
    case 'intensity':
      return {
        title: `Prefers ${noun.article}`,
        body: `${noun.title} dishes have consistently landed with you.`,
      };
    case 'treatment':
      return {
        title: `Enjoys it ${noun.title}`,
        body: `Prepared ${noun.title}, this has worked out for you.`,
      };
    case 'role':
      return {
        title: `Appreciates ${noun.title}`,
        body: `A ${noun.article} touch is what completes a dish for you.`,
      };
    default:
      return { title: `Enjoys ${noun.title}`, body: `This keeps appearing in rescues you chose.` };
  }
}

function progressCopy(dimension: TasteSignal['dimension'], value: string): TemplateCopy {
  const noun = dimensionNoun(dimension, value);
  return {
    title: `In progress: ${noun.title}`,
    body:
      `We're beginning to see a shape around ${noun.article}, but there isn't ` +
      `enough consistency to call it yet.`,
  };
}

function discoveryCopy(dimension: TasteSignal['dimension'], value: string): TemplateCopy {
  const noun = dimensionNoun(dimension, value);
  return {
    title: `Noticed: ${noun.title}`,
    body:
      `This is too new to claim. We spotted ${noun.article} recently and will ` +
      `keep an eye out for more.`,
  };
}

function stillLearningCopy(dimension: TasteSignal['dimension'], value: string): TemplateCopy {
  const noun = dimensionNoun(dimension, value);
  return {
    title: `Still figuring out: ${noun.title}`,
    body:
      `The signals around ${noun.article} are thin or pull in different ` +
      `directions, so we're not guessing about it yet.`,
  };
}

function dimensionNoun(
  dimension: TasteSignal['dimension'],
  value: string,
): { title: string; article: string } {
  const title = humanize(value);
  switch (dimension) {
    case 'flavor':
      return { title, article: title.toLowerCase() };
    case 'ingredient':
      return { title, article: title.toLowerCase() };
    case 'cuisine':
      return { title: cuisineName(value), article: cuisineName(value) };
    default:
      return { title, article: title.toLowerCase() };
  }
}