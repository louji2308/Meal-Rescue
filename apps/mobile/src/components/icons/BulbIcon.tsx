import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function BulbIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M9 18h6" />
      <Path d="M10 22h4" />
      <Path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </IconBase>
  );
}
