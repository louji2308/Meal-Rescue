import { TextStyle } from 'react-native';

/**
 * Design tokens - Phase 1 foundation for the Phase 3 design system.
 * Warm, food-friendly palette; kept minimal until UI engineering phase.
 */
export const colors = {
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  secondary: '#F57C00',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#212121',
  textSecondary: '#757575',
  border: '#E0E0E0',
  error: '#C62828',
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
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  heading: {
    fontSize: 20,
    fontWeight: '600',
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
