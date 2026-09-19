import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function FlashIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
    </IconBase>
  );
}
