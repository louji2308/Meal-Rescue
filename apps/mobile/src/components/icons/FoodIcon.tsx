import React from 'react';
import { Path, Ellipse } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/**
 * Steaming bowl of food — hot meal icon.
 */
export function FoodIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      {/* Steam lines */}
      <Path d="M8 5c0-1.5 1-2.5 0-4" />
      <Path d="M12 4c0-1.5 1-2.5 0-4" />
      <Path d="M16 5c0-1.5 1-2.5 0-4" />
      {/* Bowl */}
      <Path d="M3 11h18c0 5-4 9-9 9s-9-4-9-9z" />
      {/* Bowl rim */}
      <Ellipse cx={12} cy={11} rx={9} ry={2} />
    </IconBase>
  );
}
