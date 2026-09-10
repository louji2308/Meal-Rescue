import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../../services/haptics';
import { colors, spacing } from '../../theme';

/** Pure so copy lives in one place and stays trivially testable. */
export function buildScanSteps(mealText: string | null): string[] {
  const subject = mealText?.trim()
    ? `"${mealText.trim().slice(0, 40)}${mealText.length > 40 ? '…' : ''}"`
    : 'your meal';
  return [`Reading ${subject}`, 'Checking your pantry…', 'Finding the best move…'];
}

interface ScanStep {
  label: string;
  state: 'done' | 'active' | 'pending';
}

const STEP_MS = 2800;

export function ScanningLoader({ mealText }: { mealText: string | null }) {
  const steps = useMemo(() => buildScanSteps(mealText), [mealText]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const id = setInterval(() => {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }, STEP_MS);
    return () => clearInterval(id);
  }, [steps]);

  useEffect(() => {
    if (index > 0) haptics.light();
  }, [index]);

  const beam = useSharedValue(-60);

  useEffect(() => {
    beam.value = -60;
    beam.value = withRepeat(
      withTiming(220, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(beam);
  }, [beam]);

  const beamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: beam.value }] }));

  const rendered: ScanStep[] = steps.map((label, i) => ({
    label,
    state: i < index ? 'done' : i === index ? 'active' : 'pending',
  }));
  const active = rendered[index];

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Analyzing your meal"
    >
      <View style={styles.scanWindow}>
        <Animated.View style={[styles.beam, beamStyle]} />
        {rendered.map((step) => (
          <View key={step.label} style={styles.stepRow}>
            <Text style={[styles.tick, step.state === 'done' ? styles.tickDone : null]}>
              {step.state === 'done' ? '✓' : step.state === 'active' ? '›' : '·'}
            </Text>
            <Text
              style={[
                styles.stepText,
                step.state === 'active' ? styles.stepActive : null,
                step.state === 'pending' ? styles.stepPending : null,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </View>
      {active && active.label.startsWith('Finding') ? (
        <Text style={styles.hint}>This usually takes ~15 seconds</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  scanWindow: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  beam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(46,125,50,0.10)',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tick: {
    width: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tickDone: {
    color: colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  stepActive: {
    fontWeight: '600',
  },
  stepPending: {
    color: colors.textSecondary,
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
