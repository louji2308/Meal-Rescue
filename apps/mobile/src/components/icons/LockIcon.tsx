import React from 'react';
import { Path, Rect } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/** Thin outline padlock — marks Pro-locked plan days. */
export function LockIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Rect x="3" y="11" width="18" height="11" rx="2.5" />
      <Path d="M7.5 11V7a4.5 4.5 0 0 1 9 0v4" />
    </IconBase>
  );
}
