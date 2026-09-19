import React from 'react';
import { Path, Rect } from 'react-native-svg';
import { IconBase, SvgIconProps } from './base';

export function MailIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Rect x={2} y={4} width={20} height={16} rx={2} />
      <Path d="M22 7l-10 6L2 7" />
    </IconBase>
  );
}
