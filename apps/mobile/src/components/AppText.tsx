import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';

import { fonts } from '../theme';

const WEIGHT_FAMILY: Record<string, string> = {
  '100': fonts.thin,
  '200': fonts.extraLight,
  '300': fonts.light,
  normal: fonts.regular,
  '400': fonts.regular,
  '500': fonts.medium,
  '600': fonts.semiBold,
  '700': fonts.bold,
  bold: fonts.bold,
  '800': fonts.extraBold,
  '900': fonts.black,
};

function resolveFontFamily(style: TextProps['style']): string | undefined {
  const flat = StyleSheet.flatten(style as TextStyle | TextStyle[]);
  if (flat?.fontFamily) return undefined;
  const weight = flat?.fontWeight;
  if (weight == null) return fonts.regular;
  return WEIGHT_FAMILY[String(weight)] ?? fonts.regular;
}

/**
 * App-wide Text that defaults to Inter. Any `fontWeight` in the style is
 * mapped to the matching Inter family, so existing styles keep working and
 * every piece of text renders in Inter without per-style edits.
 */
export function Text({ style, ...rest }: TextProps) {
  const fontFamily = resolveFontFamily(style);
  return <RNText {...rest} style={fontFamily ? [{ fontFamily }, style] : style} />;
}