/**
 * Taste Journal tuning - every threshold the journal uses lives here.
 *
 * The mobile UI renders what these numbers produce; it never re-derives
 * taste intelligence. Everything is deterministic - there is no LLM in the
 * journal path, so two users with identical evidence see identical copy.
 */

export const tasteJournalConfig = {
  /** Minimum evidence count before a strand is called "emerging". */
  MIN_EVIDENCE_EMERGING: 1,

  /** Minimum evidence count before a strand can be an established pattern. */
  MIN_EVIDENCE_ESTABLISHED: 3,

  /** Minimum confidence to surface a strand at all. Sub-threshold = hidden. */
  MIN_CONFIDENCE_SURFACE: 0.3,

  /** Share of observations one direction must reach to avoid "mixed". */
  POLARITY_MAJORITY_SHARE: 0.6,

  /**
   * If BOTH directions hold at least this share of evidence, the strand is
   * conflicted: "you sometimes love it, sometimes you steer away".
   */
  CONFLICT_MINORITY_SHARE: 0.3,

  /**
   * If a single context bucket holds at least this share of evidence, the
   * strand is contextual: the preference is tied to that context.
   */
  CONTEXTUAL_PREFIX_SHARE: 0.6,

  /** Cap on how many patterns we surface in YOUR PATTERNS (spec: 3-5). */
  PATTERNS_MAX: 5,

  /** Cap on IT DEPENDS rows. */
  DEPENDENT_PATTERNS_MAX: 3,

  /** Cap on RECENTLY DISCOVERED rows. */
  DISCOVERIES_MAX: 4,

  /** Cap on STILL LEARNING rows (empty list hides the section). */
  STILL_LEARNING_MAX: 5,

  /** A discovery counts as recent within this window. */
  DISCOVERY_RECENCY_DAYS: 14,

  /**
   * Evidence weight per source. EXPLICIT_FEEDBACK outranks passive behavior;
   * ONBOARDING is a soft prior; SYSTEM_INFERENCE is weakest (derived, never
   * user-asserted) and decays first.
   */
  SOURCE_WEIGHTS: {
    ONBOARDING: 0.6,
    BEHAVIOR: 1,
    EXPLICIT_FEEDBACK: 1.5,
    SYSTEM_INFERENCE: 0.4,
  } as const,

  /** Historical evidence backfilled from pre-feature data is down-weighted. */
  BACKFILL_WEIGHT_MULTIPLIER: 0.5,

  /** Decay applied to SYSTEM_INFERENCE confidence after this many days idle. */
  INFERENCE_STALENESS_DAYS: 30,

  /** After this many days without a signal, the journal reads "stale". */
  STALENESS_DAYS: 60,

  /** Confidence floor the summary counts as "established". */
  ESTABLISHED_CONFIDENCE: 0.55,

  /** Label on the "why this?" screen defining the whole feature. */
  FEATURE_NOTE:
    'Everything here comes from what you have told us - never from guessing.',
} as const;

export type TasteJournalConfig = typeof tasteJournalConfig;

/**
 * Source precedence for the journal's evidence trail.
 * @deprecated internal - only used to sort "first seen" attribution.
 */
export const SOURCE_PRECEDENCE: TasteSignalSourcePrecedence = {
  ONBOARDING: 0,
  EXPLICIT_FEEDBACK: 1,
  BEHAVIOR: 2,
  SYSTEM_INFERENCE: 3,
};

interface TasteSignalSourcePrecedence {
  ONBOARDING: number;
  EXPLICIT_FEEDBACK: number;
  BEHAVIOR: number;
  SYSTEM_INFERENCE: number;
}