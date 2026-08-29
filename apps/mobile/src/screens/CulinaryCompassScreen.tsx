import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CulinaryFamily } from '@meal-rescue/shared-types';

import { PrimaryButton } from '../components/PrimaryButton';
import { seedCompass, skipCompass } from '../services/culture.api';
import { colors, spacing, typography } from '../theme';
import { spring } from '../theme/motion';

const FAMILIES: Array<{
  family: CulinaryFamily;
  emoji: string;
  blurb: string;
}> = [
  { family: 'indian', emoji: '🍛', blurb: 'bold spice, comfort curries' },
  { family: 'east_asian', emoji: '🍜', blurb: 'noodles, rice, umami' },
  { family: 'mediterranean', emoji: '🫒', blurb: 'olive oil, bright & fresh' },
  { family: 'mexican', emoji: '🌮', blurb: 'warm, bold, lively' },
  { family: 'american', emoji: '🍔', blurb: 'hearty, familiar comfort' },
  { family: 'middle_eastern', emoji: '🥙', blurb: 'earthy spice, warm flatbread' },
  { family: 'italian', emoji: '🍝', blurb: 'ripe tomato, fresh basil' },
];

interface Props {
  onComplete: (skipped: boolean) => void;
}

const TRACK_RANGE = [-1, 1]; // tradition <-1..+1>

export function CulinaryCompassScreen({ onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [tradition, setTradition] = useState(-0.6); // default: lean traditional
  const [busy, setBusy] = useState(false);
  const trackWidth = useRef(0);

  // UI-thread morph values: the outgoing card flies out as the next card springs up.
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);
  const deck = useSharedValue(0); // 0..1 progress into the deck

  const settle = useCallback(() => {
    translateY.value = withSpring(0, spring.gentle);
    rotate.value = withSpring(0, spring.gentle);
    scale.value = withSpring(1, spring.gentle);
  }, [translateY, rotate, scale]);

  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, FAMILIES.length - 1));
    setTimeout(() => {
      deck.value = 0;
      settle();
    }, 180);
  }, [deck, settle]);

  const morphOut = useCallback(() => {
    deck.value = withSpring(1, spring.snappy);
    translateY.value = withSpring(-240, spring.bouncy);
    rotate.value = withSpring(-14, spring.snappy);
    runOnJS(advance)();
  }, [deck, translateY, rotate, advance]);

  // RN-core PanResponder drives the shared values (no extra gesture library needed).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10,
        onPanResponderMove: (_e, g) => {
          translateY.value = g.dy;
          rotate.value = interpolate(g.dy, [-200, 0, 200], [-12, 0, 12], Extrapolate.CLAMP);
          scale.value = interpolate(Math.abs(g.dy), [0, 220], [1, 0.85], Extrapolate.CLAMP);
        },
        onPanResponderRelease: (_e, g) => {
          const threshold = 110;
          if (g.dy < -threshold) {
            morphOut();
          } else if (g.dy > threshold && index > 0) {
            setIndex(0);
            settle();
          } else {
            settle();
          }
        },
        onPanResponderTerminate: () => settle(),
      }),
    [translateY, rotate, scale, morphOut, settle, index],
  );

  // Continuous tradition <-1..+1> drag across the track width.
  const trackPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2,
        onPanResponderGrant: (e) => updateTradition(e.nativeEvent.locationX),
        onPanResponderMove: (e) => updateTradition(e.nativeEvent.locationX),
      }),
    [],
  );

  function updateTradition(locationX: number) {
    if (trackWidth.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth.current));
    setTradition(TRACK_RANGE[0] + ratio * (TRACK_RANGE[1] - TRACK_RANGE[0]));
  }

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const deckStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(deck.value, [0, 1], [14, 0]) }],
    opacity: interpolate(deck.value, [0, 1], [0.5, 1]),
  }));

  async function finish(skip: boolean) {
    setBusy(true);
    try {
      if (skip) {
        await skipCompass();
      } else if (FAMILIES[index]) {
        await seedCompass({
          family: FAMILIES[index]!.family,
          traditionVsModern: tradition,
        });
      } else {
        await skipCompass();
      }
      onComplete(skip);
    } finally {
      setBusy(false);
    }
  }

  const current = FAMILIES[index]!;
  const next = FAMILIES[Math.min(index + 1, FAMILIES.length - 1)]!;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.title, styles.title]}>
          Where does your plate usually come from?
        </Text>
        <Text style={[typography.body, styles.subtitle]}>
          Flick through the cards and pick the one that feels most like home. Skip it — we&apos;ll
          just learn by watching.
        </Text>

        <Animated.View style={styles.stage} {...pan.panHandlers}>
          {/* back deck card springs up behind the front card */}
          <Animated.View style={[styles.deckCard, deckStyle]} pointerEvents="none">
            <Text style={styles.deckEmoji}>{next.emoji}</Text>
          </Animated.View>

          <Animated.View style={[styles.card, cardStyle]}>
            <Text style={styles.emoji}>{current.emoji}</Text>
            <Text style={styles.blurb}>{current.blurb}</Text>
            <View style={styles.dots}>
              {FAMILIES.map((f, i) => (
                <Pressable
                  key={f.family}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${f.blurb}`}
                  accessibilityState={{ selected: i === index }}
                  onPress={() => setIndex(i)}
                  style={styles.dot}
                >
                  <View style={[styles.dotCore, i === index && styles.dotActive]} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </Animated.View>

        <Text style={styles.axisTitle}>Pure &amp; traditional</Text>
        <View style={styles.axisWrap}>
          <View
            style={styles.track}
            {...trackPan.panHandlers}
            onLayout={(e) => {
              trackWidth.current = e.nativeEvent.layout.width;
            }}
          >
            {[-1, -0.5, 0, 0.5, 1].map((val) => (
              <View
                key={val}
                style={[
                  styles.trackNotch,
                  Math.abs(tradition - val) < 0.251 ? styles.trackNotchActive : null,
                ]}
              />
            ))}
          </View>
          <View style={styles.axisLabels}>
            <Text style={styles.axisLabelLeft}>Home-style</Text>
            <Text style={styles.axisLabelRight}>Love a twist</Text>
          </View>
        </View>

        <PrimaryButton
          label="That's my kitchen"
          busy={busy}
          disabled={!current}
          onPress={() => void finish(false)}
          style={styles.go}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip the culinary compass"
          onPress={() => void finish(true)}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  title: { textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.lg },
  stage: { height: 300, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  deckCard: {
    position: 'absolute',
    width: 290,
    height: 220,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckEmoji: { fontSize: 40 },
  card: {
    width: 290,
    height: 220,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  emoji: { fontSize: 52, marginBottom: spacing.sm },
  blurb: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary },
  axisTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  axisWrap: { marginBottom: spacing.xl },
  track: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackNotch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    margin: 4,
    backgroundColor: colors.border,
  },
  trackNotchActive: { backgroundColor: colors.primary },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  axisLabelLeft: { fontSize: 12, color: colors.textSecondary },
  axisLabelRight: { fontSize: 12, color: colors.textSecondary },
  go: { marginBottom: spacing.md },
  skip: { alignItems: 'center', padding: spacing.md },
  skipText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
});
