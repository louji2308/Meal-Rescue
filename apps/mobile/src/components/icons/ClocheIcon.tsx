import React from 'react';
import { Circle, Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/**
 * Cloche (serving dome) held by a hand — Flaticon "holding hand dinner"
 * (17588773). Hand reads clearly at small sizes: arm sweeping up from the
 * bottom-left, flat index finger under the tray, two curled fingers on the
 * right. Callers should pass strokeWidth >= 2.2 for the intended bold look.
 */
export function ClocheIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      {/* Knob */}
      <Circle cx={12} cy={5.2} r={1.6} />
      {/* Dome */}
      <Path d="M5.5 14.5a6.5 6.5 0 0 1 13 0" />
      {/* Tray rim — extends past the dome on both sides */}
      <Path d="M3 14.5h18" />
      {/* Arm / palm sweeping up from bottom-left to support the tray */}
      <Path d="M7 22.5c-.6-3.6.8-6.9 4.3-7.5" />
      {/* Flat index finger under the tray */}
      <Path d="M10.5 17.6h4.4" />
      {/* Curled fingers hanging from the right rim */}
      <Path d="M15.2 14.9c2.9.8 4.3 2.9 4.1 5-.15 1.55-1.25 2.55-2.4 3" />
      <Path d="M13.7 17.1c1.75 1.45 3.1 3.5 3.3 6" />
    </IconBase>
  );
}
