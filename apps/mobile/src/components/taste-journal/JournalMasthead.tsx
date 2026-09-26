import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { TasteJournalSummary } from '@meal-rescue/shared-types';

import { colors, fonts, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { BookIcon, ChevronLeftIcon } from '../icons';
import { Pressable } from '../motion/Pressable';

/**
 * Journal masthead - a quiet editorial header: emblem, one-line promise,
 * a stat strip built from the live summary, and a freshness note that
 * only appears when the read is getting stale.
 */
export function JournalMasthead({
  summary,
  onBack,
}: {
  summary: TasteJournalSummary;
  onBack: () => void;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to profile"
        onPress={onBack}
        style={styles.backRow}
        tintBorderRadius={12}
      >
        <ChevronLeftIcon size={18} color={colors.homeTextQuiet} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.masthead}>
        <View style={styles.emblem}>
          <BookIcon size={18} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Your Taste Journal</Text>
        <Text style={styles.promise}>
          Every line is grounded in something you've told or shown us.
        </Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{summary.establishedCount}</Text>
            <Text style={styles.statLabel}>reads</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{summary.patternsCount}</Text>
            <Text style={styles.statLabel}>patterns</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{summary.totalSignals}</Text>
            <Text style={styles.statLabel}>observations</Text>
          </View>
        </View>

        {summary.freshness === 'stale' ? (
          <View style={styles.staleRow}>
            <View style={styles.staleDot} />
            <Text style={styles.staleNote}>
              These reads are based on older observations — they quiet down over time.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    marginBottom: spacing.md,
  },
  backText: { color: colors.homeTextQuiet, fontFamily: fonts.medium, fontSize: 14 },

  masthead: {
    marginBottom: spacing.xl,
  },
  emblem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.homeInk,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.homeInk,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  promise: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  stats: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xl,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  statNum: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.homeInk,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  staleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.softCaution,
  },
  staleNote: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
});
