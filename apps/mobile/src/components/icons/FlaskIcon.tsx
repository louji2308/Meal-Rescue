import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function FlaskIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M9 3h6" />
      <Path d="M10 3v7.4a2 2 0 0 1-.5 1.3L4 17.5a2 2 0 0 0-.5 1.5V21h17v-2a2 2 0 0 0-.5-1.5l-5.5-5.8A2 2 0 0 1 14 10.4V3" />
    </IconBase>
  );
}
