import React from 'react';
import { Rect, Line, Circle } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/**
 * Calendar with a small meal accent — the "what's here?" trigger.
 * Rounded page, two binding rings, and a clean date grid.
 */
export function CalendarIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      {/* Calendar page */}
      <Rect x={3} y={4} width={18} height={17} rx={3} ry={3} />
      {/* Header bar */}
      <Line x1={3} y1={9} x2={21} y2={9} />
      {/* Binding rings */}
      <Line x1={8} y1={2.5} x2={8} y2={5.5} />
      <Line x1={16} y1={2.5} x2={16} y2={5.5} />
      {/* Date dots */}
      <Circle cx={7.5} cy={13} r={1} fill={props.color} stroke="none" />
      <Circle cx={12} cy={13} r={1} fill={props.color} stroke="none" />
      <Circle cx={16.5} cy={13} r={1} fill={props.color} stroke="none" />
      <Circle cx={7.5} cy={17} r={1} fill={props.color} stroke="none" />
      <Circle cx={12} cy={17} r={1} fill={props.color} stroke="none" />
    </IconBase>
  );
}
