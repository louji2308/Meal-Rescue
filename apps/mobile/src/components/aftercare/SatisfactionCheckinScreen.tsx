import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { haptics } from '../../services/haptics';
import { colors, spacing, typography } from '../../theme';
import {
  type SatisfactionResult,
  useSatisfactionCheckin,
} from '../checkins/useSatisfactionCheckin';
import { aftercareColors } from './tokens';

/** Route params for SATISFACTION_ROUTE: { rescueId, recommendation }. */
export interface SatisfactionCheckinParams {
  rescueId: string;
  recommendation: string;
}

const OPTIONS: Array<{
  value: SatisfactionResult;
  label: string;
  emoji: string;
  hint: string;
}> = [
  {
    value: 'EXACTLY',
    label: 'Exactly',
    emoji: '😋',
    hint: 'It was exactly what I wanted',
  },
  {
    value: 'ALMOST',
    label: 'Almost',
    emoji: '🙂',
    hint: 'Close, but something was off',
  },
  {
    value: 'NOT_REALLY',
    label: 'Not really',
    emoji: '😕',
    hint: 'That was not it for me',
  },
];

const REASONS: Partial<Record<SatisfactionResult, string[]>> = {
  EXACTLY: ['loved the flavour', 'it just worked'],
  ALMOST: ['too plain', 'not filling enough', 'not what I wanted'],
  NOT_REALLY: ['not what I wanted', 'too much effort', 'too plain', 'not filling enough'],
};

/**
 * "Did that hit the spot?" (§8/§17).
 *
 * A caring-friend check-in, not a rating gate. One tap records the result;
 * nothing is forced, everything is dismissible. When the answer isn't
 * "Exactly", a guilt-free optional row offers plain-language reasons. The
 * recorded response's personalizationImpact is shown so the user sees the
 * feedback actually doing something ("next time I'll lean that way") instead
 * of vanishing into a form.
 */
export function SatisfactionCheckinScreen({
  route,
}: {
  route: { params: SatisfactionCheckinParams };
}) {
  const navigation = useNavigation();
  const { rescueId, recommendation } = route.params;
  const { status, response, submit } = useSatisfactionCheckin({ rescueId });
  const picked = useRef<SatisfactionResult | null>(null);
  const postedReasons = useRef<string[]>([]);

  const close = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const choose = useCallback(
    (value: SatisfactionResult) => {
      if (status === 'submitting') return;
      picked.current = value;
      haptics.medium();
      void submit(value);
    },
    [status, submit],
  );

  const addReason = useCallback(
    (value: SatisfactionResult, reason: string) => {
      if (postedReasons.current.includes(reason)) {
        postedReasons.current = postedReasons.current.filter((r) => r !== reason);
      } else {
        postedReasons.current = [...postedReasons.current, reason];
      }
      haptics.light();
      void submit(value, postedReasons.current);
    },
    [submit],
  );

  const submitted = response !== null;
  const busy = status === 'submitting';
  const reasons = picked.current ? (REASONS[picked.current] ?? []) : [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.eyebrow}>A quick check-in</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close check-in"
          onPress={close}
          hitSlop={12}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>Done for now</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.title, styles.question]}>Did that hit the spot?</Text>
        <Text style={styles.context}>For: {recommendation}</Text>

        {!submitted && (
          <View style={styles.options}>
            {OPTIONS.map((option) => {
              const on = picked.current === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: on, busy }}
                  disabled={busy}
                  onPress={() => choose(option.value)}
                  style={[styles.option, on && styles.optionOn]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionHint}>{option.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {busy && <Text style={styles.note}>Noting that down…</Text>}
          </View>
        )}

        {submitted && response && (
          <View style={styles.thanks}>
            <Text style={styles.thanksEmoji}>{picked.current === 'EXACTLY' ? '✨' : '🙏'}</Text>
            <Text style={styles.thanksTitle}>
              {picked.current === 'EXACTLY' ? 'Love that for you.' : 'Thanks for telling me.'}
            </Text>
            <Text style={styles.thanksBody}>
              {picked.current === 'EXACTLY'
                ? "I'll keep steering you toward the same kind of move."
                : 'Next time I\u2019ll lean the other way.'}
            </Text>

            {response.personalizationImpact.length > 0 && (
              <View style={styles.impact}>
                <Text style={styles.impactTitle}>What this teaches me</Text>
                {response.personalizationImpact.map((line) => (
                  <View key={line} style={styles.impactRow}>
                    <Text style={styles.impactBullet}>·</Text>
                    <Text style={styles.impactText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}

            {picked.current !== 'EXACTLY' && reasons.length > 0 && (
              <View style={styles.reasons}>
                <Text style={styles.reasonsTitle}>What was off? (skippable)</Text>
                <View style={styles.reasonChips}>
                  {reasons.map((reason) => {
                    const on = postedReasons.current.includes(reason);
                    return (
                      <TouchableOpacity
                        key={reason}
                        accessibilityRole="button"
                        accessibilityLabel={reason}
                        accessibilityState={{ selected: on }}
                        onPress={() => picked.current && addReason(picked.current, reason)}
                        style={[styles.reasonChip, on && styles.reasonChipOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{reason}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close check-in"
              onPress={close}
              style={styles.done}
              activeOpacity={0.7}
            >
              <Text style={styles.doneText}>Back to my meal</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'error' && !response && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>
              Couldn’t save that just now. No big deal — it didn’t go anywhere.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={() => picked.current && submit(picked.current, postedReasons.current)}
              style={styles.retry}
              activeOpacity={0.7}
            >
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  eyebrow: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  question: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  context: {
    ...typography.caption,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 64,
  },
  optionOn: {
    borderColor: aftercareColors.accent,
    backgroundColor: aftercareColors.accentSoft,
  },
  optionEmoji: {
    fontSize: 26,
    marginRight: spacing.md,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  optionHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  note: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontSize: 14,
  },
  thanks: {
    gap: spacing.sm,
  },
  thanksEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  thanksTitle: {
    ...typography.heading,
    textAlign: 'center',
  },
  thanksBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  impact: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  impactTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  impactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  impactBullet: {
    color: aftercareColors.accent,
    fontWeight: '700',
  },
  impactText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  reasons: {
    marginTop: spacing.sm,
  },
  reasonsTitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reasonChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  reasonChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  reasonTextOn: {
    color: colors.surface,
  },
  done: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  doneText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  errorWrap: {
    backgroundColor: aftercareColors.accentSoft,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: colors.text,
  },
  retry: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    color: aftercareColors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
