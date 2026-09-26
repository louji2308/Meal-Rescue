import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../services/haptics';
import { colors, fonts, radius, spacing, touch } from '../theme';
import { spring } from '../theme/motion';
import { Text } from './AppText';
import { WaveLoading } from './WaveLoading';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Optional element rendered to the left of the label (e.g. an outline icon). */
  icon?: React.ReactNode;
}

const VARIANTS = {
  primary: { backgroundColor: colors.homeButton, textColor: colors.surface },
  secondary: { backgroundColor: 'transparent', textColor: colors.text },
  ghost: { backgroundColor: 'transparent', textColor: colors.text },
  destructive: { backgroundColor: colors.error, textColor: colors.surface },
} as const;

const OUTLINED_VARIANTS = new Set(['secondary']);

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  style,
  icon,
}: PrimaryButtonProps) {
  const palette = VARIANTS[variant];
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressed.value ? 0.97 : 1, pressed.value ? spring.snappy : spring.gentle),
      },
    ],
    opacity: withTiming(pressed.value ? 0.9 : 1, { duration: 100 }),
  }));

  const disabledOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(disabled || busy ? 0.4 : 1, { duration: 200 }),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled }}
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
          { backgroundColor: palette.backgroundColor },
          OUTLINED_VARIANTS.has(variant) ? styles.outlined : null,
          animated,
          disabledOpacity,
          style,
        ]}
      >
        {busy && (
          <Animated.View
            style={styles.loadingWrap}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(120)}
          >
            <WaveLoading />
          </Animated.View>
        )}
        {!busy && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(120)}
            style={styles.content}
          >
            {icon ? icon : null}
            <Text style={[styles.label, { color: palette.textColor }]}>{label}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touch.min + 8,
  },
  outlined: {
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
