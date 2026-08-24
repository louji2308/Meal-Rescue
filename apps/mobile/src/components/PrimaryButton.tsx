import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, spacing } from '../theme';
import { spring } from '../theme/motion';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isGhost = variant === 'ghost';
  const backgroundColor = isGhost ? 'transparent' : colors[variant];
  const textColor = isGhost ? colors.primary : colors.surface;
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressed.value ? 0.97 : 1, pressed.value ? spring.snappy : spring.gentle),
      },
    ],
    opacity: withTiming(pressed.value ? 0.9 : 1, { duration: 100 }),
  }));

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
      activeOpacity={1}
      disabled={disabled || busy}
      onPressIn={() => {
        if (!disabled && !busy) {
          pressed.value = 1;
          haptics.light();
        }
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.base,
          { backgroundColor },
          disabled || busy ? styles.disabled : null,
          animated,
          style,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
