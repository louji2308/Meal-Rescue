import React from 'react';
import { StyleSheet, TextInput as RNTextInput, TextInputProps, TextStyle } from 'react-native';

import { colors, fonts } from '../theme';

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
export function TextInput({ style, placeholderTextColor, selectionColor, ...rest }: TextInputProps) {
  const fontFamily = resolveFontFamily(style);
  const textStyle = fontFamily ? [{ fontFamily }, style] : style;
  return (
    <RNTextInput
      {...rest}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      selectionColor={selectionColor ?? colors.primary}
      style={textStyle}
    />
  );
}