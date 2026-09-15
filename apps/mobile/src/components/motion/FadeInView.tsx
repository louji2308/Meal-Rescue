import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

/**
 * FadeInView — calm content entrance.
 *
 * - `rise=0` (default): pure cross-fade (skeleton → content swaps).
 * - `rise>0`: gentle upward drift, ideal for hero blocks and cards.
 * - `delay`: stagger index * step for lists.
 * Exits with a fast fade so nothing lingers when it unmounts.
 */
export function FadeInView({
  children,
  delay = 0,
  duration = 240,
  rise = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const entering = rise > 0 ? FadeInDown : FadeIn;
  return (
    <Animated.View
      entering={entering
        .delay(delay)
        .duration(duration)
        .easing(Easing.out(Easing.cubic))}
      exiting={FadeOut.duration(120)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}