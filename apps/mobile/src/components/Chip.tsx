import React, { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, spacing } from '../theme';
import { spring } from '../theme/motion';
import { Text } from './AppText';

interface ChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  style?: ViewStyle;
}

/**
 * Tappable constraint shortcut - skippable by design; the system infers
 * the rest. Selection pops with a spring and a light tap.
 */
export function Chip({ label, selected, onToggle, style }: ChipProps) {
  const scale = useSharedValue(1);
  const selectionProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    if (selected) {
      scale.value = 0.92;
      scale.value = withSpring(1, spring.snappy);
      haptics.light();
    }
    selectionProgress.value = withTiming(selected ? 1 : 0, { duration: 200 });
  }, [selected, scale, selectionProgress]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: interpolateColor(
      selectionProgress.value,
      [0, 1],
      [colors.border, colors.borderStrong],
    ),
    backgroundColor: interpolateColor(
      selectionProgress.value,
      [0, 1],
      [colors.surface, colors.primaryLight],
    ),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onToggle}
    >
      <Animated.View style={[styles.base, animated, style]}>
        <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
});
