import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function InfoIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </IconBase>
  );
}
