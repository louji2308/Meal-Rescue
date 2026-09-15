import React, { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './AppText';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, spacing } from '../theme';
import { spring } from '../theme/motion';

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

  useEffect(() => {
    if (selected) {
      scale.value = 0.92;
      scale.value = withSpring(1, spring.snappy);
      haptics.light();
    }
  }, [selected, scale]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.base, selected ? styles.selected : null, style]}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onToggle}
    >
      <Animated.View style={[styles.inner, animated]}>
        <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  selected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  inner: {},
  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
});
