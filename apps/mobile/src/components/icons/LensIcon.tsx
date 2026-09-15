import React from 'react';
import { Circle } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/**
 * A camera lens with a soft golden glow — the "what's here?" trigger.
 * The glow is layered translucent rings so it reads even at small sizes.
 */
export function LensIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={12} r={10.2} fill={props.color} opacity={0.12} />
      <Circle cx={12} cy={12} r={7.6} fill={props.color} opacity={0.2} />
      <Circle cx={12} cy={12} r={5.4} stroke={props.color} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={2.1} fill={props.color} />
      <Circle cx={9.6} cy={9.6} r={1.1} fill="#FFFFFF" />
    </IconBase>
  );
}