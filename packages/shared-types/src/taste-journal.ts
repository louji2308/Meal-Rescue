import type { Confidence, ISO8601, UUID } from './index';

/**
 * Taste Journal - evidence-backed taste presentation.
 *
 * Every claim the journal makes is backed by recorded signals. The journal
 * never fabricates: an insight appears only when the underlying evidence
 * crosses a threshold, and the "why this?" deep-dive returns the raw evidence
 * trail behind it. Thresholds live in backend config, never in the mobile UI.
 */

// ---------------------------------------------------------------------------
// Signal primitives
// ---------------------------------------------------------------------------

/** What kind of thing a signal is about. */
export type TasteSignalDimension =
  | 'cuisine'
  | 'cuisine_style'
  | 'ingredient'
  | 'flavor'
  | 'texture'
  | 'temperature'
  | 'intensity'
  | 'treatment'
  | 'role';

/** Where a signal came from. */
export type TasteSignalSource =
  | 'ONBOARDING'
  | 'BEHAVIOR'
  | 'EXPLICIT_FEEDBACK'
  | 'SYSTEM_INFERENCE';

export type TasteSignalPolarity = 'positive' | 'negative' | 'mixed' | 'neutral';

export type TasteSignalStatus =
  | 'UNKNOWN'
  | 'EMERGING'
  | 'ESTABLISHED'
  | 'CONTEXTUAL'
  | 'CONFLICTED'
  | 'EXPLICIT'
  | 'DISMISSED';

/** One observed context bucket for a signal (e.g. cuisine: mexican, 60% of evidence). */
export interface TasteSignalContext {
  contextType: string;
  contextValue: string;
  count: number;
  share: number;
  polarity: TasteSignalPolarity;
}

/** A single strand of evidence: one (dimension, value) observation cluster. */
export interface TasteSignal {
  id: UUID;
  userId: UUID;
  dimension: TasteSignalDimension;
  value: string;
  polarity: TasteSignalPolarity;
  confidence: Confidence;
  status: TasteSignalStatus;
  evidenceCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  sourceTypes: TasteSignalSource[];
  primarySourceType: TasteSignalSource;
  contexts: TasteSignalContext[];
  firstObservedAt: ISO8601;
  lastObservedAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Editorial presentation (the journal the user reads)
// ---------------------------------------------------------------------------

export type TasteJournalInsightKind =
  | 'pattern'
  | 'dependent'
  | 'discovery'
  | 'still_learning'
  | 'boundary'
  | 'progress';

export type TasteInsightOverrideAction = 'DISMISSED' | 'CORRECTED' | 'FORGOTTEN';

export interface TasteInsightOverride {
  action: TasteInsightOverrideAction;
  note?: string;
  /** When the user corrects an insight ("that's not me, actually I love it"). */
  correctedPolarity?: TasteSignalPolarity;
  correctedValue?: string;
  createdAt: ISO8601;
}

/**
 * One deterministic, user-facing insight. Rendered by the mobile screen from
 * this shape only - the frontend performs no taste inference of its own.
 */
export interface TasteJournalInsight {
  /** Stable identity, e.g. "STRAND:ingredient:chicken". No UUID churn per change. */
  id: string;
  kind: TasteJournalInsightKind;
  /** Short header, e.g. "Spice, but on your terms". */
  title: string;
  /** Editorial body copy. Backend-composed from templates, never a percentage. */
  body: string;
  dimension: TasteSignalDimension;
  value?: string;
  polarity?: TasteSignalPolarity;
  confidence: Confidence;
  evidenceCount: number;
  sourceTypes: TasteSignalSource[];
  contexts: TasteSignalContext[];
  lastObservedAt: ISO8601;
  /** Present only when the user has acted on this insight. */
  override?: TasteInsightOverride;
}

export type TasteBoundaryGroupKind = 'USUALLY_WORKS' | 'DEPENDS' | 'USUALLY_AVOID';

export interface TasteBoundaryGroup {
  group: TasteBoundaryGroupKind;
  title: string;
  subtitle: string;
  items: TasteJournalInsight[];
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export interface TasteJournalSummary {
  totalSignals: number;
  establishedCount: number;
  patternsCount: number;
  boundariesCount: number;
  lastActiveAt: ISO8601 | null;
  freshness: 'fresh' | 'stale';
}

export interface TasteJournal {
  summary: TasteJournalSummary;
  /** YOUR TASTE IN PROGRESS - emerging strands, not yet a confident read. */
  progress: TasteJournalInsight[];
  /** YOUR PATTERNS - the 3-5 strongest established likes/dislikes. */
  patterns: TasteJournalInsight[];
  /** IT DEPENDS - context splits the same factor both ways. */
  dependentPatterns: TasteJournalInsight[];
  /** RECENTLY DISCOVERED - newly emerging strands (first-time evidence). */
  discoveries: TasteJournalInsight[];
  /** STILL LEARNING - thin or conflicting signals we're watching. Empty = hidden. */
  stillLearning: TasteJournalInsight[];
  /** YOUR BOUNDARIES - USUALLY WORKS / DEPENDS / USUALLY AVOID. */
  boundaries: TasteBoundaryGroup[];
}

/** One attributable piece of evidence behind an insight. */
export interface TasteSignalEvidence {
  source: TasteSignalSource;
  sourceLabel: string;
  polarity: TasteSignalPolarity;
  eventId?: string;
  /** Context this piece of evidence was observed in, when known. */
  context?: TasteSignalContext;
  note?: string;
  occurredAt: ISO8601;
}

/** Full transparency unpacking for "Why do you think this?". */
export interface TasteJournalEvidenceDetail {
  insightId: string;
  dimension: TasteSignalDimension;
  value: string;
  polarity: TasteSignalPolarity;
  confidence: Confidence;
  status: TasteSignalStatus;
  evidenceCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  sourceTypes: TasteSignalSource[];
  contexts: TasteSignalContext[];
  evidence: TasteSignalEvidence[];
}

export type TasteJournalOverrideAction = 'DISMISS' | 'CORRECT' | 'FORGET';

export interface TasteJournalOverrideRequest {
  action: TasteJournalOverrideAction;
  note?: string;
  /** Only meaningful for CORRECT - what the user says the true direction is. */
  correctedPolarity?: 'positive' | 'negative';
  correctedValue?: string;
}

export interface TasteJournalOverrideResponse {
  success: true;
  insightId: string;
  action: TasteInsightOverrideAction;
}