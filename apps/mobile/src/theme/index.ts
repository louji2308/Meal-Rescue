import { TextStyle } from 'react-native';

/**
 * Design tokens — light editorial base (white, black, gray) with a
 * pastel icon palette layered on top. Icons carry soft, light colors;
 * text, backgrounds, and surfaces stay monochrome.
 */
export const colors = {
  /** Primary accent — black. Buttons, selected states, headlines. */
  primary: '#000000',
  /** Light highlight — soft gray for selected card backgrounds, badges. */
  primaryLight: '#F0F0F0',
  /** Secondary — medium gray for subtle accents and secondary actions. */
  secondary: '#6B6B6B',
  /** App background — warm off-white. */
  background: '#FAFAFA',
  /** Card / surface background — pure white. */
  surface: '#FFFFFF',
  /** Primary text — high-contrast black. */
  text: '#000000',
  /** Secondary / muted text — lighter gray. */
  textSecondary: '#999999',
  /** Borders and dividers — subtle light gray. */
  border: '#E8E8E8',
  /** Error — red for destructive / error states. */
  error: '#C62828',
  /** Success — green reserved for positive feedback only. */
  success: '#2E7D32',
  /** Soft icon palette — light pastels, never saturated "oil" tones. */
  softRed: '#F2A7A1',
  softPink: '#F6B9CC',
  softPeach: '#FBC9A6',
  softYellow: '#F9E6A0',
  softGreen: '#BCE3BB',
  softCyan: '#B7E1E6',
  softViolet: '#CBB9E9',
  softPurple: '#D9B8EA',
} as const;

/**
 * Font families — Inter, loaded once at app start (see App.tsx).
 * Clean, rounded, highly legible; each weight is its own native family.
 */
export const fonts = {
  thin: 'Inter_100Thin',
  extraLight: 'Inter_200ExtraLight',
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  title: {
    fontSize: 32,
    fontWeight: '800',
    fontFamily: fonts.extraBold,
    color: colors.text,
    letterSpacing: -0.5,
    lineHeight: 38,
  } as TextStyle,
  heading: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.text,
    lineHeight: 26,
  } as TextStyle,
  body: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
    lineHeight: 23,
  } as TextStyle,
  caption: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  } as TextStyle,
};
