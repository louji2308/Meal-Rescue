import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function GitCompareIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={18} cy={18} r={3} />
      <Circle cx={6} cy={6} r={3} />
      <Path d="M6 21V9a9 9 0 0 0 9 9" />
    </IconBase>
  );
}
