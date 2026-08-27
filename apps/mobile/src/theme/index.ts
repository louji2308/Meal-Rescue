import { TextStyle } from 'react-native';

/**
 * Design tokens — monochrome editorial palette inspired by
 * premium black-and-white app design. The kitchen cat is
 * the only color element; everything else is black, white, and gray.
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
    color: colors.text,
    letterSpacing: -0.5,
  } as TextStyle,
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  body: {
    fontSize: 16,
    color: colors.text,
  } as TextStyle,
  caption: {
    fontSize: 13,
    color: colors.textSecondary,
  } as TextStyle,
};
