import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type {
  TasteJournalEvidenceDetail as EvidenceDetail,
  TasteJournalEvidenceDetail,
  TasteJournalInsight,
  TasteSignalEvidence,
} from '@meal-rescue/shared-types';

import { toApiError } from '../../services/api';
import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { Pressable } from '../motion/Pressable';

const POLARITY_READ: Record<string, string> = {
  positive: 'You lean into this',
  negative: 'You tend to avoid this',
  mixed: 'You take it both ways',
  neutral: 'A neutral note',
};

const POLARITY_WORD: Record<string, string> = {
  positive: 'Liked',
  negative: 'Avoided',
  mixed: 'Mixed',
  neutral: 'Noted',
};

const POLARITY_DOT: Record<string, string> = {
  positive: colors.softGreen,
  negative: colors.softRed,
  mixed: colors.softCaution,
  neutral: colors.textSecondary,
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatSourceLabel(source: TasteSignalEvidence['source']): string {
  switch (source) {
    case 'ONBOARDING':
      return 'your setup';
    case 'BEHAVIOR':
      return ' your rescues';
    case 'EXPLICIT_FEEDBACK':
      return 'your ratings';
    case 'SYSTEM_INFERENCE':
      return 'our reading';
    default:
      return 'our memory';
  }
}

/**
 * EvidenceDetail - the honest "why we think this" behind one insight.
 *
 * Fetching is lazy and live: the panel only appears when the entry is
 * expanded, and it always re-fetches from the backend so the trail you
 * read is the trail that produced the claim.
 */
export function EvidenceDetail({
  insight,
  fetchEvidence,
}: {
  insight: TasteJournalInsight;
  fetchEvidence: (id: string) => Promise<EvidenceDetail>;
}) {
  const [detail, setDetail] = useState<TasteJournalEvidenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchEvidence(insight.id));
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Load once per expansion; the fetch is cheap and the evidence is versioned.
  }, [insight.id]);

  if (loading) {
    return (
      <View style={styles.root}>
        <Text style={styles.kicker}>Why we think this</Text>
        <Text style={styles.loading}>Reading the observations…</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.root}>
        <Text style={styles.kicker}>Why we think this</Text>
        <Text style={styles.error}>Couldn't load the evidence trail.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={styles.retry}
          tintBorderRadius={10}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>Why we think this</Text>

      <View style={styles.readRow}>
        <Text style={styles.readText}>
          <Text style={styles.readValue}>{detail.value}</Text> ·{' '}
          {POLARITY_READ[detail.polarity] ?? detail.polarity}
        </Text>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>{detail.positiveCount} liked</Text>
        <Text style={styles.countDot}>·</Text>
        <Text style={styles.count}>{detail.negativeCount} avoided</Text>
        <Text style={styles.countDot}>·</Text>
        <Text style={styles.count}>{detail.neutralCount} neutral</Text>
      </View>

      {detail.contexts.length > 0 ? (
        <View style={styles.contexts}>
          <Text style={styles.contextLabel}>Where it shows up</Text>
          {detail.contexts.map((ctx, i) => (
            <View key={`${ctx.contextType}-${ctx.contextValue}-${i}`} style={styles.contextRow}>
              <View style={styles.contextTrack}>
                <View
                  style={[
                    styles.contextFill,
                    {
                      flex: ctx.share,
                      backgroundColor: POLARITY_DOT[ctx.polarity] ?? colors.textSecondary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.contextText}>
                {ctx.contextValue} · {Math.round(ctx.share * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.evidence}>
        <Text style={styles.contextLabel}>
          The observations{detail.evidence.length > 0 ? ` (${detail.evidenceCount})` : ''}
        </Text>
        {detail.evidence.length === 0 ? (
          <Text style={styles.evidenceEmpty}>
            The trail behind this read is quiet right now, but it will grow as you keep rescuing
            meals.
          </Text>
        ) : (
          detail.evidence.map((item, i) => (
            <View key={`${item.occurredAt}-${i}`} style={styles.evidenceRow}>
              <View
                style={[styles.evidenceDot, { backgroundColor: POLARITY_DOT[item.polarity] }]}
              />
              <View style={styles.evidenceBody}>
                <View style={styles.evidenceTop}>
                  <Text style={styles.evidenceSource}>{formatSourceLabel(item.source)}</Text>
                  <Text style={styles.evidencePolarity}>
                    {POLARITY_WORD[item.polarity] ?? item.polarity}
                  </Text>
                  {item.occurredAt ? (
                    <Text style={styles.evidenceDate}>{shortDate(item.occurredAt)}</Text>
                  ) : null}
                </View>
                {item.note ? <Text style={styles.evidenceNote}>{item.note}</Text> : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.homeTextTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  loading: {
    ...typography.caption2,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.error,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  retryText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.homeInk,
  },

  readRow: { marginTop: 2 },
  readText: {
    ...typography.bodySmall,
    color: colors.homeInk,
  },
  readValue: {
    fontFamily: fonts.medium,
    color: colors.homeInk,
  },

  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  count: {
    ...typography.caption2,
    color: colors.textSecondary,
  },
  countDot: {
    color: colors.borderStrong,
    fontSize: 12,
  },

  contextLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.homeTextTertiary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  contexts: {
    gap: spacing.sm,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contextTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  contextFill: {
    height: 6,
    borderRadius: 3,
  },
  contextText: {
    ...typography.caption2,
    color: colors.textSecondary,
    width: 130,
    textAlign: 'right',
  },

  evidence: {
    marginTop: spacing.xs,
  },
  evidenceEmpty: {
    ...typography.caption,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm - 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  evidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  evidenceBody: {
    flex: 1,
  },
  evidenceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  evidenceSource: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.homeInk,
    flexShrink: 1,
  },
  evidencePolarity: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  evidenceDate: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.homeTextTertiary,
    marginLeft: 'auto',
  },
  evidenceNote: {
    ...typography.caption2,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
