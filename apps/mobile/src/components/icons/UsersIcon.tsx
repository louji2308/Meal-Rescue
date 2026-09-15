import React from 'react';
import { Circle, Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function UsersIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}