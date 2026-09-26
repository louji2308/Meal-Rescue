import React from 'react';
import {
  type PressableProps,
  Pressable as RNPressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spring } from '../../theme/motion';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Scale applied while pressed (default 0.98). */
  scaleTo?: number;
  /** A tint overlay shown while pressed (opacity of a color wash). */
  pressedTintOpacity?: number;
  pressedTintColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * PressableScale — spec §32 interaction states.
 *
 * Pressed: scale 0.98 over 120ms, optional colour wash (e.g. a 6% charcoal
 * tint) for the quiet secondary rows, or a 100% darker wash for solid CTAs.
 * Release springs back. Feel = physical, never bouncy.
 */
export function PressableScale({
  scaleTo = 0.98,
  pressedTintOpacity = 0,
  pressedTintColor = '#161616',
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(
          pressed.value ? scaleTo : 1,
          pressed.value ? { damping: 18, stiffness: 180, mass: 1 } : spring.gentle,
        ),
      },
    ],
  }));

  const tintStyle = useAnimatedStyle(() => ({
    opacity: withTiming(pressed.value ? pressedTintOpacity : 0, {
      duration: pressed.value ? 120 : 140,
    }),
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (disabled) return;
        pressed.value = 1;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        onPressOut?.(e);
      }}
      style={[style, animated] as any}
    >
      {pressedTintOpacity > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: pressedTintColor,
              borderRadius: 999,
            },
            tintStyle,
          ]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);
