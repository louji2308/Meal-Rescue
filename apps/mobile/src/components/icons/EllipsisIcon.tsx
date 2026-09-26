import React from 'react';
import { Circle } from 'react-native-svg';

import { colors } from '../../theme';
import { IconBase, SvgIconProps } from './base';

export function EllipsisIcon(props: SvgIconProps) {
  const dot = props.color ?? colors.homeInk;
  return (
    <IconBase {...props}>
      <Circle cx={5} cy={12} r={1.6} fill={dot} stroke={dot} />
      <Circle cx={12} cy={12} r={1.6} fill={dot} stroke={dot} />
      <Circle cx={19} cy={12} r={1.6} fill={dot} stroke={dot} />
    </IconBase>
  );
}
