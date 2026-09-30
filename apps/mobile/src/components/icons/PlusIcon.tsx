import React from 'react';
import { Path } from 'react-native-svg';

import { IconBase, SvgIconProps } from './base';

/** Thin outline plus — the free "add someone" affordance on the table roster. */
export function PlusIcon(props: SvgIconProps) {
  return (
    <IconBase {...props}>
      <Path d="M12 5v14" />
      <Path d="M5 12h14" />
    </IconBase>
  );
}
