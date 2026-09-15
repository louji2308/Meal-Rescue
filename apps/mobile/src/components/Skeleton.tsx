import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle, type DimensionValue } from 'react-native';
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

function SkeletonBlock({ width = '100%', height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        { width, height, borderRadius },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function Skeleton({
  lines,
  ...blockProps
}: SkeletonProps & { lines?: number }) {
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