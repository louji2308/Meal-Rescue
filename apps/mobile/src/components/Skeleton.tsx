import React, { useEffect } from 'react';
import { type DimensionValue, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '../theme';

type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
};

const SHIMMER_WIDTH = 120;

function SkeletonBlock({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const translateX = useSharedValue(-SHIMMER_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SHIMMER_WIDTH + 400, {
        duration: 1000,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );
  }, [translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius }, style, { overflow: 'hidden' }]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.border }]} />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            width: SHIMMER_WIDTH,
            backgroundColor: 'rgba(255,255,255,0.35)',
            borderRadius,
          },
          shimmerStyle,
        ]}
      />
    </View>
  );
}

export function Skeleton({ lines, ...blockProps }: SkeletonProps & { lines?: number }) {
  const rows = lines ?? 1;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock
          key={i}
          width={rows > 1 && i === rows - 1 ? '60%' : '100%'}
          {...blockProps}
        />
      ))}
    </View>
  );
}

Skeleton.Block = SkeletonBlock;

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
    marginBottom: 10,
  },
});
