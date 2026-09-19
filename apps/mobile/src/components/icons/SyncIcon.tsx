import React from 'react';
import { Path } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function SyncIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M21.5 2v6h-6" />
      <Path d="M2.5 22v-6h6" />
      <Path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" />
      <Path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
    </IconBase>
  );
}
