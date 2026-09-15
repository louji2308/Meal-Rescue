import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleSheet, ViewStyle } from 'react-native';

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Scale applied while pressed (default 0.98). */
  scaleTo?: number;
  /** A tint overlay shown while pressed (opacity of a color wash). */
  pressedTintOpacity?: number;
  pressedTintColor?: string;
  style?: ViewStyle | ViewStyle[];
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
  const scale = useRef(new Animated.Value(1)).current;
  const tint = useRef(new Animated.Value(0)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: scaleTo, duration: 120, useNativeDriver: true }),
      Animated.timing(tint, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const animateOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 4 }),
      Animated.timing(tint, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (disabled) return;
        animateIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateOut();
        onPressOut?.(e);
      }}
      style={[{ transform: [{ scale }] } as ViewStyle, style]}
    >
      {pressedTintOpacity > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: pressedTintColor,
              opacity: tint.interpolate({
                inputRange: [0, 1],
                outputRange: [0, pressedTintOpacity],
              }),
              borderRadius: 999,
            },
          ]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);