import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../../services/haptics';
import { colors, spacing } from '../../theme';
import { spring } from '../../theme/motion';

/** Time until the addition chip lands; siblings delay entrances past this. */
export const PLATE_DIFF_LAND_MS = 1050;

interface PlateDiffRevealProps {
  foods: string[];
  additionLabel: string;
}

/**
 * Visualizes the brand promise: the plate dims, then ONE addition lands
 * with spring physics and a pulse ring - "the smallest change".
 */
export function PlateDiffReveal({ foods, additionLabel }: PlateDiffRevealProps) {
  const dimmed = useSharedValue(0);
  const dropY = useSharedValue(-70);
  const dropScale = useSharedValue(0.8);
  const ring = useSharedValue(0);

  useEffect(() => {
    dimmed.value = withTiming(1, { duration: 380 });
    dropY.value = withDelay(PLATE_DIFF_LAND_MS - 620, withSpring(0, spring.bouncy));
    dropScale.value = withDelay(PLATE_DIFF_LAND_MS - 620, withSpring(1, spring.bouncy));
    ring.value = withDelay(PLATE_DIFF_LAND_MS - 40, withTiming(1, { duration: 520 }));
    const id = setTimeout(() => haptics.medium(), PLATE_DIFF_LAND_MS - 30);
    return () => clearTimeout(id);
  }, [dimmed, dropY, dropScale, ring]);

  const foodStyle = useAnimatedStyle(() => ({
    opacity: 1 - dimmed.value * 0.55,
  }));

  const dropStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dropY.value }, { scale: dropScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.8 + ring.value * 0.9 }],
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.mealLine}>Your meal</Text>
      <View style={styles.foodsRow}>
        {foods.slice(0, 6).map((food) => (
          <Animated.View key={food} style={[styles.foodChip, foodStyle]}>
            <Text style={styles.foodText}>{food}</Text>
          </Animated.View>
        ))}
        {foods.length > 6 ? (
          <Animated.View style={[styles.foodChip, foodStyle]}>
            <Text style={styles.foodText}>+{foods.length - 6}</Text>
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.additionSlot}>
        <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />
        <Animated.View style={[styles.additionChip, dropStyle]}>
          <Text style={styles.additionText}>{additionLabel}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  mealLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  foodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  foodChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  foodText: {
    fontSize: 13,
    color: colors.text,
    textTransform: 'capitalize',
  },
  additionSlot: {
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.secondary,
    top: -8,
  },
  additionChip: {
    backgroundColor: colors.secondary,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  additionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'capitalize',
  },
});
