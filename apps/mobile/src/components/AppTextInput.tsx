import React, { useCallback } from 'react';
import { TextInput as RNTextInput, StyleSheet, TextInputProps, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../theme';

const AnimatedTextInput = Animated.createAnimatedComponent(RNTextInput);

function resolveFontFamily(style: TextInputProps['style']): string | undefined {
  const flat = StyleSheet.flatten(style as TextStyle | TextStyle[]);
  if (flat?.fontFamily) return undefined;
  return fonts.regular;
}

/**
 * App-wide TextInput that defaults to Inter so typed text matches the rest
 * of the UI. Unstyled by design — screens own their field chrome. When a
 * screen does not set placeholder/selection colors, compliant defaults are
 * applied so muted text never drops below WCAG AA.
 */
export function TextInput({
  style,
  placeholderTextColor,
  selectionColor,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps) {
  const borderColor = useSharedValue<string>(colors.border);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: borderColor.value,
  }));

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (e) => {
      borderColor.value = withTiming(colors.primary, { duration: 200 }) as unknown as string;
      onFocus?.(e);
    },
    [borderColor, onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (e) => {
      borderColor.value = withTiming(colors.border, { duration: 200 }) as unknown as string;
      onBlur?.(e);
    },
    [borderColor, onBlur],
  );

  const fontFamily = resolveFontFamily(style);
  const textStyle = fontFamily ? [{ fontFamily }, style] : style;

  return (
    <AnimatedTextInput
      {...rest}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      selectionColor={selectionColor ?? colors.primary}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[textStyle, animatedStyle]}
    />
  );
}
