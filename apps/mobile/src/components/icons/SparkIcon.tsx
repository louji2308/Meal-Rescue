import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function SparkIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M12 3v3" />
      <Path d="M12 18v3" />
      <Path d="M3 12h3" />
      <Path d="M18 12h3" />
      <Path d="M5.6 5.6l2.1 2.1" />
      <Path d="m16.3 16.3 2.1 2.1" />
      <Path d="M5.6 18.4l2.1-2.1" />
      <Path d="m16.3 7.7 2.1-2.1" />
    </IconBase>
  );
}