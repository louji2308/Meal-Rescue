import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { spring } from '../../theme/motion';

export type ScrapsMood = 'idle' | 'scanning' | 'celebrate';

interface ScrapsCatProps {
  mood?: ScrapsMood;
  size?: number;
}

/**
 * Scraps - the kitchen rescue cat. Idle blinks; scanning flicks pupils;
 * celebrate bounces with happy eyes. Vector-only, zero asset pipeline.
 */
export function ScrapsCat({ mood = 'idle', size = 72 }: ScrapsCatProps) {
  const pupilX = useSharedValue(0);
  const bounceY = useSharedValue(0);
  const blinkProgress = useSharedValue(0);

  useEffect(() => {
    if (mood === 'celebrate') {
      bounceY.value = 0;
      bounceY.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: 160, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
      pupilX.value = withSpring(0, spring.snappy);
      blinkProgress.value = 0;
    } else if (mood === 'scanning') {
      pupilX.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 500 }),
          withTiming(3, { duration: 900 }),
          withTiming(0, { duration: 400 }),
        ),
        -1,
        false,
      );
      blinkProgress.value = 0;
      bounceY.value = 0;
    } else {
      blinkProgress.value = withRepeat(
        withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 90 })),
        -1,
        false,
      );
      pupilX.value = 0;
      bounceY.value = 0;
    }
  }, [mood, blinkProgress, pupilX, bounceY]);

  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const pupilStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pupilX.value }],
  }));

  const isCelebrating = mood === 'celebrate';
  const eyeScaleY = Math.max(0.05, 1 - blinkProgress.value * 0.95);

  return (
    <Animated.View
      style={[{ width: size, height: size }, wrapperStyle]}
      accessible
      accessibilityLabel="Scraps the rescue cat"
    >
      <Svg viewBox="0 0 64 64" width={size} height={size}>
        <Ellipse cx="32" cy="42" rx="17" ry="14" fill="#E8A87C" />
        <Circle cx="32" cy="26" r="14" fill="#E8A87C" />
        <Path d="M20 16 L24 5 L29 14 Z" fill="#E8A87C" />
        <Path d="M44 16 L40 5 L35 14 Z" fill="#E8A87C" />
        <Path
          d="M49 40 Q58 38 56 28"
          stroke="#D98E5F"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {isCelebrating ? (
          <>
            <Path
              d="M23 25 Q26 21 29 25"
              stroke="#3B2F2F"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M35 25 Q38 21 41 25"
              stroke="#3B2F2F"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Path
              d="M27 22 L27 28"
              stroke="#3B2F2F"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity={eyeScaleY}
            />
            <Path
              d="M31.6 22 L31.6 28"
              stroke="#3B2F2F"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity={eyeScaleY}
            />
          </>
        )}
        <Path
          d="M30 31 Q32 33 34 31"
          stroke="#3B2F2F"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      {!isCelebrating && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: size * 0.44, top: size * 0.35 }, pupilStyle]}
        >
          <Svg width={6} height={6} viewBox="0 0 6 6">
            <Circle cx="3" cy="3" r="1.6" fill="#3B2F2F" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}
