import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors, spacing } from '../theme';

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

const DOT_COUNT = 5;
const DOT_SIZE = 8;
const DOT_GAP = 6;
const CYCLE_MS = 1400;

export function WaveLoading({ style }: { style?: object }) {
  const dots = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0)),
  ).current;
  const [msgIdx, setMsgIdx] = useState(0);
  const msgRef = useRef(0);

  useEffect(() => {
    const animations = dots.map(function (dot, i) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: CYCLE_MS / 2,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: CYCLE_MS / 2,
            useNativeDriver: true,
          }),
        ]),
      );
    });
    const composite = Animated.parallel(animations);
    composite.start();

    const msgTimer = setInterval(function () {
      msgRef.current = (msgRef.current + 1) % ANALYSIS_MESSAGES.length;
      setMsgIdx(msgRef.current);
    }, 2200);

    return function cleanup() {
      composite.stop();
      clearInterval(msgTimer);
    };
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.dotsRow}>
        {dots.map(function (dot, i) {
          const scale = dot.interpolate({
            inputRange: [0, 1],
            outputRange: [0.5, 1.3],
          });
          const opacity = dot.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  transform: [{ scale }],
                  opacity: opacity,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.message}>{ANALYSIS_MESSAGES[msgIdx]}</Text>
    </View>
  );
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
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
