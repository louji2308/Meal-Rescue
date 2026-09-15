import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function BellIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </IconBase>
  );
}