import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
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
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.base, selected ? styles.selected : null, style]}
      activeOpacity={0.7}
      onPress={onToggle}
    >
      <Animated.View style={[styles.inner, animated]}>
        <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
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
  },
  selected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  inner: {},
  label: {
    fontSize: 14,
    color: colors.text,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
