import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function HelpCircleIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <Path d="M12 17h.01" />
    </IconBase>
  );
}
