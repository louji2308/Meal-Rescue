import React from 'react';
import { StyleSheet, TextInput as RNTextInput, TextInputProps, TextStyle } from 'react-native';

import { fonts } from '../theme';

function resolveFontFamily(style: TextInputProps['style']): string | undefined {
  const flat = StyleSheet.flatten(style as TextStyle | TextStyle[]);
  if (flat?.fontFamily) return undefined;
  return fonts.regular;
}

/**
 * App-wide TextInput that defaults to Inter so typed text matches the rest
 * of the UI.
 */
export function TextInput({ style, ...rest }: TextInputProps) {
  const fontFamily = resolveFontFamily(style);
  return <RNTextInput {...rest} style={fontFamily ? [{ fontFamily }, style] : style} />;
}