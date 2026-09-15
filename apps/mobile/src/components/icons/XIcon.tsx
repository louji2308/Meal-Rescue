import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function XIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </IconBase>
  );
}