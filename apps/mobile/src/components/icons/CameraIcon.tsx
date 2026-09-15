import React from 'react';
import { Circle, Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

export function CameraIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <Circle cx="12" cy="13" r="3" />
    </IconBase>
  );
}