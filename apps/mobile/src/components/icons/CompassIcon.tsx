import React from 'react';
import { Path, Circle, Polygon } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function CompassIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </IconBase>
  );
}
