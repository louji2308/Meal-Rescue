import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function TrendingIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M23 6l-9.5 9.5-5-5L1 18" />
      <Path d="M17 6h6v6" />
    </IconBase>
  );
}
