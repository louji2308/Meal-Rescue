import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function PackageIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M7.5 4.27 16.5 9.42" />
      <Path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <Path d="m3.3 7 8.7 5 8.7-5" />
      <Path d="M12 22V12" />
    </IconBase>
  );
}