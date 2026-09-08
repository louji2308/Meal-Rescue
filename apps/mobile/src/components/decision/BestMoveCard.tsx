import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DecisionAction, RescueCandidate } from '@meal-rescue/shared-types';

import { colors, spacing, typography } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';
import { PawStamp } from '../mascot/PawStamp';
import { actionLine, costLine, whyLine } from './copy';

/**
 * BEST MOVE hero (plan §9 / §13 / §35).
 *
 * Always ONE recommendation up front:
 *  (a) action line (from decision / candidate.actionType)
 *  (b) ONE human "why" (from satisfiesIntent/satisfiesReality + nutrition flags)
 *  (c) humane cost (~15 min · low effort)
 *  (d) ONE "Do this" CTA
 * When the action is KEEP_AS_IS we render a "You're done" card instead.
 */
export function BestMoveCard({
  action,
  candidate,
  foods,
  isPro,
  onDoThis,
  busy,
}: {
  action: DecisionAction | undefined;
  candidate: RescueCandidate;
  foods: string[];
  isPro: boolean;
  onDoThis: () => void;
  busy: boolean;
}) {
  const additions = candidate.additions.map((a) => a.name);
  const isKeepAsIs =
    action === 'KEEP_AS_IS' ||
    candidate.satisfiesIntent === false ||
    (candidate.additions.length === 0 &&
      candidate.substitutions.length === 0 &&
      candidate.cookingSteps === 0);

  if (isKeepAsIs) {
    return (
      <View style={[styles.card, styles.keepCard]}>
        <View style={styles.keepHead}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
          <View style={styles.keepTextWrap}>
            <Text style={[typography.heading, styles.keepTitle]}>You’re done.</Text>
            <Text style={styles.keepBody}>
              Your plate already fits what you want tonight. No changes needed — enjoy it.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, isPro && styles.pawCard]}>
      {isPro && <PawStamp size={28} rotation={-12} opacity={0.85} style={styles.cardStamp} />}
      <Text style={[typography.caption, styles.eyebrow]}>YOUR BEST MOVE</Text>
      <Text style={[typography.heading, styles.action]}>{actionLine(action, additions)}</Text>
      <Text style={styles.why}>{whyLine(action, candidate, foods)}</Text>
      <View style={styles.costRow}>
        <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.cost}>
          {costLine(candidate.estimatedMinutes, candidate.estimatedCostLevel)}
        </Text>
      </View>
      <PrimaryButton label="Do this" onPress={onDoThis} busy={busy} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  pawCard: {
    paddingBottom: spacing.xl,
  },
  cardStamp: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
  },
  eyebrow: {
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
    color: colors.secondary,
  },
  action: {
    color: colors.primary,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  why: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  cost: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  cta: {},
  keepCard: {
    borderColor: colors.success,
    backgroundColor: '#F1F8F1',
  },
  keepHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  keepTextWrap: {
    flex: 1,
  },
  keepTitle: {
    color: colors.success,
    marginBottom: spacing.xs,
  },
  keepBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
});
