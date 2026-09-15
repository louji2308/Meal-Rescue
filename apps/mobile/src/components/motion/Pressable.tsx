import React from 'react';
import {
  Pressable as RNPressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '../../services/haptics';
import { spring } from '../../theme/motion';

interface PressableProps2 extends Omit<PressableProps, 'style'> {
  /** Scale applied while pressed (default 0.96). */
  scaleTo?: number;
  /** Optional tint wash while pressed. */
  pressedTintColor?: string;
  /** Opacity of the tint wash (default 0.06). */
  pressedTintOpacity?: number;
  /** Disable haptic feedback. */
  disableHaptics?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Universal animated Pressable — the single touchable for the entire app.
 *
 * - Scale down on press (spring snappy), spring back on release.
 * - Light haptic on press.
 * - Optional tint wash overlay.
 * - Wraps children in Animated.View for smooth transforms.
 */
export function Pressable({
  scaleTo = 0.96,
  pressedTintColor = '#161616',
  pressedTintOpacity = 0.06,
  disableHaptics = false,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableProps2) {
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(pressed.value ? scaleTo : 1, pressed.value ? spring.snappy : spring.gentle) },
    ],
    opacity: withTiming(pressed.value ? 0.92 : 1, { duration: 100 }),
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (disabled) return;
        pressed.value = 1;
        if (!disableHaptics) haptics.light();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        onPressOut?.(e);
      }}
      style={[style, animated] as any}
    >
      {pressedTintOpacity > 0 ? (
        <AnimatedTint
          color={pressedTintColor}
          opacity={pressedTintOpacity}
          pressed={pressed}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

function AnimatedTint({
  color,
  opacity: maxOpacity,
  pressed,
}: {
  color: string;
  opacity: number;
  pressed: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(pressed.value ? maxOpacity : 0, { duration: 120 }),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          inset: 0,
          backgroundColor: color,
          borderRadius: 999,
        },
        style,
      ]}
    />
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);
