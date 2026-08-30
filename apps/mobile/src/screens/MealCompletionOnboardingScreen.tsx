import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  OnboardingAnswer,
  OnboardingPair,
  OnboardingRejectionReason,
  OnboardingSummaryResponse,
} from '@meal-rescue/shared-types';

import { PrimaryButton } from '../components/PrimaryButton';
import { haptics } from '../services/haptics';
import { answerOnboarding, startOnboarding } from '../services/onboarding.api';
import { colors, spacing, typography } from '../theme';

interface Props {
  onComplete: (skipped: boolean) => void;
}

type Phase = 'loading' | 'pair' | 'summary' | 'error';

const SKIP_REASONS: Array<{ reason: OnboardingRejectionReason; label: string }> = [
  { reason: 'taste', label: 'Not for me' },
  { reason: 'too_much_effort', label: 'Too much work' },
  { reason: 'not_appropriate_for_meal', label: 'Doesn\u2019t fit the meal' },
  { reason: 'not_hungry_enough', label: 'Not hungry right now' },
];

const REASON_STATE_LABEL: Record<
  OnboardingSummaryResponse['factors'][number]['confidence'],
  string
> = {
  unknown: 'First impression',
  inferred: 'Emerging',
  confirmed: 'Solid signal',
};

export function MealCompletionOnboardingScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pair, setPair] = useState<OnboardingPair | null>(null);
  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    setPhase('loading');
    setBusy(true);
    try {
      const start = await startOnboarding();
      if (start.seeded) {
        onComplete(false);
        return;
      }
      if (!start.pair) {
        onComplete(false);
        return;
      }
      setPair(start.pair);
      setPhase('pair');
    } catch {
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [onComplete]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(answer: OnboardingAnswer) {
    if (busy) return;
    setBusy(true);
    setShowReasons(false);
    try {
      const res = await answerOnboarding(answer);
      setProgress((p) => p + 1);
      if (res.summary) {
        setSummary(res.summary);
        setPhase('summary');
      } else if (res.next) {
        setPair(res.next);
      } else {
        onComplete(false);
      }
    } catch {
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }

  const choose = (selected: 'A' | 'B') => {
    if (!pair || busy) return;
    haptics.light();
    void submit({
      pairId: pair.id,
      selected,
      unavailableOption: null,
    });
  };

  const markUnavailable = (unavailableOption: 'A' | 'B') => {
    if (!pair || busy) return;
    haptics.light();
    void submit({
      pairId: pair.id,
      selected: null,
      unavailableOption,
    });
  };

  const skipWithReason = (rejectionReason: OnboardingRejectionReason) => {
    if (!pair || busy) return;
    haptics.light();
    void submit({
      pairId: pair.id,
      selected: null,
      unavailableOption: null,
      rejectionReason,
    });
  };

  const renderSummary = () => {
    if (!summary) return null;
    return (
      <Animated.View entering={FadeInDown.duration(280)} style={styles.summary}>
        <Text style={typography.title}>How you like to finish a meal</Text>
        <Text style={[typography.body, styles.subtitle]}>
          A first sketch of your taste. It learns more from what you actually do.
        </Text>
        {summary.factors.map((f) => {
          const fill = Math.max(0, Math.min(1, (f.score + 1) / 2));
          return (
            <View key={f.factor} style={styles.factorRow}>
              <View style={styles.factorHead}>
                <Text style={styles.factorLabel}>{f.label}</Text>
                <Text style={styles.factorMeta}>
                  {REASON_STATE_LABEL[f.confidence]}
                  {f.evidenceCount > 0
                    ? ` \u00b7 ${f.evidenceCount} ${f.evidenceCount === 1 ? 'pick' : 'picks'}`
                    : ''}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${fill * 100}%` }]} />
              </View>
            </View>
          );
        })}
        <View style={styles.summaryActions}>
          <PrimaryButton
            label="Done — take me to my messy kitchen"
            busy={busy}
            onPress={() => onComplete(false)}
          />
        </View>
      </Animated.View>
    );
  };

  const renderPair = () => {
    if (!pair) return null;
    const { baseMeal } = pair;
    return (
      <Animated.View entering={FadeInUp.duration(280)} key={pair.id} style={styles.pair}>
        <Text style={[typography.title, styles.title]}>How do you finish a meal?</Text>
        <Text style={[typography.body, styles.subtitle]}>
          Start with the same plate. Pick the one that would make it better for you. There are no
          wrong answers.
        </Text>

        <View style={styles.baseCard}>
          <Text style={styles.baseEmoji}>{baseMeal.emoji}</Text>
          <Text style={styles.baseName}>{baseMeal.name}</Text>
          <Text style={styles.baseCuisine}>{baseMeal.cuisineLabel}</Text>
          <Text style={styles.question}>{pair.question}</Text>
        </View>

        <View style={styles.options}>
          {(['A', 'B'] as const).map((side) => {
            const option = side === 'A' ? pair.optionA : pair.optionB;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityLabel={`${option.name}. ${option.blurb}`}
                accessible
                disabled={busy}
                onPress={() => choose(side)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={styles.optionName}>{option.name}</Text>
                <Text style={styles.optionRole}>{option.role}</Text>
                <Text style={styles.optionBlurb}>{option.blurb}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.auxRow}>
          {(['A', 'B'] as const).map((side) => {
            const option = side === 'A' ? pair.optionA : pair.optionB;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityLabel={`I don't have ${option.name}`}
                disabled={busy}
                onPress={() => markUnavailable(side)}
                style={styles.auxLink}
              >
                <Text style={styles.auxLinkText}>Don’t have {option.name.toLowerCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        {showReasons ? (
          <View style={styles.reasons}>
            <Text style={styles.reasonsTitle}>Why skip these?</Text>
            <View style={styles.reasonChips}>
              {SKIP_REASONS.map((r) => (
                <Pressable
                  key={r.reason}
                  accessibilityRole="button"
                  accessibilityLabel={r.label}
                  disabled={busy}
                  onPress={() => skipWithReason(r.reason)}
                  style={styles.reasonChip}
                >
                  <Text style={styles.reasonChipText}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip this pair"
            disabled={busy}
            onPress={() => setShowReasons(true)}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>Skip — we’ll learn by watching</Text>
          </Pressable>
        )}

        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{progress} so far</Text>
          <Text style={styles.progressHint}>Just a few comparisons</Text>
        </View>
      </Animated.View>
    );
  };

  const renderError = () => (
    <View style={styles.center}>
      <Text style={styles.errorEmoji}>&#128534;</Text>
      <Text style={[typography.heading, styles.errorTitle]}>Couldn’t load your first compare</Text>
      <Text style={[typography.body, styles.subtitle]}>
        Check your connection and try again — or skip for now.
      </Text>
      <PrimaryButton label="Retry" busy={busy} onPress={() => void load()} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip meal onboarding"
        onPress={() => onComplete(true)}
        style={styles.skipLink}
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'loading' && (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Setting the table&hellip;</Text>
        </View>
      )}
      {phase === 'pair' && renderPair()}
      {phase === 'summary' && renderSummary()}
      {phase === 'error' && renderError()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: 15 },
  title: { textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.lg },
  pair: { flex: 1 },
  baseCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  baseEmoji: { fontSize: 42, marginBottom: spacing.xs },
  baseName: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  baseCuisine: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  options: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  option: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  optionPressed: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionEmoji: { fontSize: 30, marginBottom: spacing.xs },
  optionName: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  optionRole: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  optionBlurb: { fontSize: 13, color: colors.text, marginTop: spacing.xs, textAlign: 'center' },
  auxRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  auxLink: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  auxLinkText: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  reasons: { marginBottom: spacing.md },
  reasonsTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  reasonChipText: { fontSize: 13, color: colors.text },
  skipLink: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
  progressText: { fontSize: 12, color: colors.textSecondary },
  progressHint: { fontSize: 12, color: colors.border },
  summary: { flex: 1, justifyContent: 'center' },
  factorRow: { marginBottom: spacing.lg },
  factorHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  factorLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  factorMeta: { fontSize: 12, color: colors.textSecondary },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  summaryActions: { marginTop: spacing.xl },
  errorEmoji: { fontSize: 40, marginBottom: spacing.md },
  errorTitle: { marginBottom: spacing.sm },
});
