import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function StatsIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M18 20V10" />
      <Path d="M12 20V4" />
      <Path d="M6 20v-6" />
    </IconBase>
  );
}
