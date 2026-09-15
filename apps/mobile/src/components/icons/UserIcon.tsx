import React from 'react';
import { Circle, Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function UserIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </IconBase>
  );
}