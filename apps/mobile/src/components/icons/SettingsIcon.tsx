import React from 'react';
import { Path, Circle } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function SettingsIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </IconBase>
  );
}
