import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, spacing } from '../theme';
import { Text } from './AppText';

const ANALYSIS_MESSAGES = [
  'Analyzing textures…',
  'Identifying flavors…',
  'Reading ingredients…',
  'Mapping your plate…',
  'Crunching pixels…',
  'Noting aromas…',
  'Scanning colors…',
  'Decoding the dish…',
];

const _DOT_COUNT = 5;
const DOT_SIZE = 8;
const DOT_GAP = 6;
const CYCLE_MS = 1400;
const STAGGER_DELAY = 180;

export function WaveLoading({ style }: { style?: object }) {
  const sv0 = useSharedValue(0);
  const sv1 = useSharedValue(0);
  const sv2 = useSharedValue(0);
  const sv3 = useSharedValue(0);
  const sv4 = useSharedValue(0);
  const progressValues = [sv0, sv1, sv2, sv3, sv4];

  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    progressValues.forEach((progress, i) => {
      progress.value = withDelay(
        i * STAGGER_DELAY,
        withRepeat(
          withSequence(
            withTiming(1, { duration: CYCLE_MS / 2 }),
            withTiming(0, { duration: CYCLE_MS / 2 }),
          ),
          -1,
        ),
      );
    });

    const msgTimer = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % ANALYSIS_MESSAGES.length);
    }, 2200);

    return () => {
      progressValues.forEach((progress) => cancelAnimation(progress));
      clearInterval(msgTimer);
    };
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.dotsRow}>
        {progressValues.map((progress, i) => (
          <AnimatedDot key={i} progress={progress} />
        ))}
      </View>
      <MessageCrossFade messages={ANALYSIS_MESSAGES} index={msgIdx} />
    </View>
  );
}

function MessageCrossFade({ messages, index }: { messages: string[]; index: number }) {
  const outgoingOpacity = useSharedValue(0);
  const incomingOpacity = useSharedValue(1);
  const prevIndex = useRef(index);

  useEffect(() => {
    if (index === prevIndex.current) return;
    outgoingOpacity.value = withTiming(0, { duration: 200 });
    incomingOpacity.value = 0;
    incomingOpacity.value = withTiming(1, { duration: 200 });
    prevIndex.current = index;
  }, [index]);

  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.value }));
  const incomingStyle = useAnimatedStyle(() => ({ opacity: incomingOpacity.value }));

  return (
    <View style={{ minHeight: 20, justifyContent: 'center' }}>
      <Animated.View style={[styles.messageWrap, outgoingStyle]} pointerEvents="none">
        <Text style={styles.message}>{messages[prevIndex.current]}</Text>
      </Animated.View>
      <Animated.View style={[styles.messageWrap, incomingStyle]}>
        <Text style={styles.message}>{messages[index]}</Text>
      </Animated.View>
    </View>
  );
}

function AnimatedDot({ progress }: { progress: SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = 0.5 + progress.value * 0.8;
    const opacity = 0.35 + progress.value * 0.65;
    const translateY = -progress.value * 10;
    return {
      transform: [{ scale }, { translateY }],
      opacity,
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.primary,
  },
  messageWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
