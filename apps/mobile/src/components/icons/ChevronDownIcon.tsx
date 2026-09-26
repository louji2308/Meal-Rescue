import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function ChevronDownIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}
