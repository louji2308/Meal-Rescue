import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function BanIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M4.93 4.93l14.14 14.14" />
    </IconBase>
  );
}
