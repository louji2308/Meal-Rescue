import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, spacing } from '../../theme';
import { Text } from '../AppText';

const DOT_COUNT = 8;
const DOT_SIZE = 10;
const CIRCLE_SIZE = 76;
const RADIUS = 28;
const CYCLE_MS = 1400;

const MESSAGES = ['Analyzing your meal…', 'Finding your best move…'];
const MESSAGE_SWITCH_MS = 3000;
const FADE_MS = 200;

function CircleDot({ progress, index }: { progress: SharedValue<number>; index: number }) {
  const angle = (index / DOT_COUNT) * 360;

  const animatedStyle = useAnimatedStyle(() => {
    const phase = (((progress.value - index / DOT_COUNT) % 1) + 1) % 1;
    const wave = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
    return {
      opacity: 0.3 + 0.7 * wave,
      transform: [
        { rotate: `${angle}deg` },
        { translateY: -RADIUS },
        { scale: 0.55 + 0.65 * wave },
      ],
    };
  });

  return <Animated.View style={[styles.slot, animatedStyle]} />;
}

function MessageCrossFade({ messages, index }: { messages: string[]; index: number }) {
  const outgoingOpacity = useSharedValue(1);
  const incomingOpacity = useSharedValue(0);
  const prevIndex = useRef(index);

  useEffect(() => {
    if (index === prevIndex.current) return;
    outgoingOpacity.value = withTiming(0, { duration: FADE_MS });
    incomingOpacity.value = 0;
    incomingOpacity.value = withTiming(1, { duration: FADE_MS });
    prevIndex.current = index;
  }, [index, incomingOpacity, outgoingOpacity]);

  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.value }));
  const incomingStyle = useAnimatedStyle(() => ({ opacity: incomingOpacity.value }));

  return (
    <View style={styles.messageBox}>
      <Animated.View style={[styles.messageWrap, outgoingStyle]} pointerEvents="none">
        <Text style={styles.message}>{messages[prevIndex.current]}</Text>
      </Animated.View>
      <Animated.View style={[styles.messageWrap, incomingStyle]} pointerEvents="none">
        <Text style={styles.message}>{messages[index]}</Text>
      </Animated.View>
    </View>
  );
}

export function ScanningLoader() {
  const progress = useSharedValue(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  useEffect(() => {
    const id = setTimeout(() => setMessageIndex(1), MESSAGE_SWITCH_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel={MESSAGES[messageIndex]}
    >
      <View
        style={styles.circle}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <CircleDot key={i} progress={progress} index={i} />
        ))}
      </View>
      <MessageCrossFade messages={MESSAGES} index={messageIndex} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  slot: {
    position: 'absolute',
    left: (CIRCLE_SIZE - DOT_SIZE) / 2,
    top: (CIRCLE_SIZE - DOT_SIZE) / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.rescueAccent,
  },
  messageBox: {
    alignSelf: 'stretch',
    minHeight: 20,
    justifyContent: 'center',
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
