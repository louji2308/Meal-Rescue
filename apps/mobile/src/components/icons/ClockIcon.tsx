import React from 'react';
import { Circle, Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function ClockIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </IconBase>
  );
}