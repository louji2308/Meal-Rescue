import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function GlowBulbIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5a6 6 0 0 0-12 0c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" />
      <Path d="M9 18h6" />
      <Path d="M10 22h4" />
      <Path d="M2.5 8H4.5" />
      <Path d="M19.5 8H21.5" />
      <Path d="M4.2 3.7l1.5 1.5" />
      <Path d="M19.8 3.7l-1.5 1.5" />
      <Path d="M4.2 12.3l1.5-1.5" />
      <Path d="M19.8 12.3l-1.5-1.5" />
    </IconBase>
  );
}
