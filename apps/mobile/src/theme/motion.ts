import { Easing } from 'react-native-reanimated';

export const durations = {
  fast: 120,
  base: 220,
  slow: 420,
  reveal: 900,
} as const;

export const easing = {
  outCubic: Easing.out(Easing.cubic),
  inOutQuad: Easing.inOut(Easing.quad),
} as const;

export const spring = {
  gentle: { damping: 16, stiffness: 140, mass: 1 },
  snappy: { damping: 20, stiffness: 260, mass: 0.9 },
  bouncy: { damping: 11, stiffness: 180, mass: 0.8 },
} as const;
