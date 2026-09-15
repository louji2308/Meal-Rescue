import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import type { ComponentProps } from 'react';

import { colors, iconSizes } from '../theme';

interface IconProps extends Omit<ComponentProps<typeof Ionicons>, 'name'> {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  accessibilityLabel?: string;
}

/**
 * Icon convention: sizes come from theme.iconSizes (18/22/28), color
 * defaults to a token, labels stay accessible. Screens that pass an explicit
 * size or color are unaffected.
 */
export function Icon({ name, size = iconSizes.md, color = colors.text, accessibilityLabel, ...rest }: IconProps) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      accessibilityLabel={accessibilityLabel}
      {...rest}
    />
  );
}