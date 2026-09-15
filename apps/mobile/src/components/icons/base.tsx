import React from 'react';
import Svg, { G } from 'react-native-svg';

import { colors } from '../../theme';

/** Consistent Lucide-style outline stroke for all app icons. */
export const ICON_STROKE = 1.7;

export interface SvgIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Shared outline-icon wrapper. Every icon keeps the same 1.7 stroke, round
 * caps/joins, and 24px grid so the whole app reads as one icon system.
 */
export function IconBase({
  size = 20,
  color = colors.homeInk,
  strokeWidth = ICON_STROKE,
  children,
}: SvgIconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  );
}