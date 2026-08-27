import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../../theme';

const PIECE_COUNT = 18;
const PALETTE = [colors.primary, colors.secondary, '#FFC107', '#4CAF50', '#E91E63'];
const BURST_MS = 750;

interface PieceSpec {
  angle: number;
  distance: number;
  rotate: number;
  size: number;
  color: string;
  delay: number;
}

function makePieces(seedKey: number): PieceSpec[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    angle: (i / PIECE_COUNT) * Math.PI * 2 + (seedKey % 7) * 0.13,
    distance: 70 + ((i * 37 + seedKey * 11) % 60),
    rotate: ((i * 53 + seedKey * 17) % 360) - 180,
    size: 6 + ((i * 13) % 6),
    color: PALETTE[i % PALETTE.length]!,
    delay: (i % 5) * 24,
  }));
}

function Piece({ spec }: { spec: PieceSpec }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, spec.delay]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(spec.angle) * spec.distance * progress.value },
      {
        translateY:
          Math.sin(spec.angle) * spec.distance * progress.value -
          progress.value * progress.value * 18,
      },
      { rotate: `${spec.rotate * progress.value}deg` },
    ],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: spec.size, height: spec.size * 0.45, backgroundColor: spec.color },
        style,
      ]}
    />
  );
}

export function ConfettiBurst({ trigger }: { trigger: number }) {
  const lastFired = useRef(-1);
  const pieces = useMemo(() => (trigger > 0 ? makePieces(trigger) : []), [trigger]);
  if (trigger > lastFired.current) lastFired.current = trigger;
  if (pieces.length === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.origin}>
        {pieces.map((spec, i) => (
          <Piece key={`${trigger}-${i}`} spec={spec} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    borderRadius: 2,
  },
  origin: {
    position: 'absolute',
    left: '50%',
    top: '62%',
  },
});
