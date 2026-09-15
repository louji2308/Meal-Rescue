import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function ChevronLeftIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}