import React from 'react';
import { Path, Circle, Line } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/**
 * Hand holding a covered serving dish — the "what's here?" trigger.
 * Clean cloche with a small handle on top and a hand below.
 */
export function ServingIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      {/* Cloche dome */}
      <Path d="M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      {/* Cloche base / rim */}
      <Line x1={3} y1={14} x2={21} y2={14} />
      {/* Handle on top */}
      <Line x1={12} y1={4} x2={12} y2={6} />
      <Circle cx={12} cy={3.5} r={1} fill={props.color} stroke="none" />
      {/* Hand / arm below */}
      <Path d="M12 14v5" />
      <Path d="M9 19h6" />
    </IconBase>
  );
}
