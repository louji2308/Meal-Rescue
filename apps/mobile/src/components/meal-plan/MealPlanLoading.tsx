import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, spacing, typography } from '../../theme';
import { Text } from '../AppText';
import { Skeleton } from '../Skeleton';
import { FadeInView } from '../motion/FadeInView';

const SENTENCES = [
  'Reading your taste memory...',
  "Checking what's in the kitchen...",
  'Learning from past rescues...',
  'Considering household preferences...',
  'Balancing variety and nutrition...',
  'Planning your perfect week...',
];

const ROTATION_INTERVAL = 2500;

interface MealPlanLoadingProps {
  visible: boolean;
}

export default function MealPlanLoading({ visible }: MealPlanLoadingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) {
      setIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % SENTENCES.length);
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <FadeInView duration={400} style={styles.container}>
      <View style={styles.content}>
        {/* Skeleton placeholders for the meal plan UI */}
        <View style={styles.skeletonArea}>
          <Skeleton width={120} height={24} borderRadius={6} />
          <View style={styles.skeletonSpacer} />
          <Skeleton width="100%" height={80} borderRadius={12} />
          <View style={styles.skeletonSpacer} />
          <Skeleton width="100%" height={120} borderRadius={12} />
        </View>
        {/* Rotating loading message */}
        <View style={styles.messageArea}>
          <Ionicons name="fitness" size={32} color={colors.primary} style={styles.icon} />
          <MessageCrossFade messages={SENTENCES} index={index} />
        </View>
      </View>
    </FadeInView>
  );
}

function MessageCrossFade({ messages, index }: { messages: string[]; index: number }) {
  const outgoingOpacity = useSharedValue(0);
  const incomingOpacity = useSharedValue(1);
  const prevIndex = useRef(index);

  useEffect(() => {
    if (index === prevIndex.current) return;
    outgoingOpacity.value = withTiming(0, { duration: 200 });
    incomingOpacity.value = 0;
    incomingOpacity.value = withTiming(1, { duration: 200 });
    prevIndex.current = index;
  }, [index]);

  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.value }));
  const incomingStyle = useAnimatedStyle(() => ({ opacity: incomingOpacity.value }));

  return (
    <View style={{ minHeight: 20, justifyContent: 'center' }}>
      <Animated.View style={[styles.messageWrap, outgoingStyle]} pointerEvents="none">
        <Text style={styles.sentence}>{messages[prevIndex.current]}</Text>
      </Animated.View>
      <Animated.View style={[styles.messageWrap, incomingStyle]}>
        <Text style={styles.sentence}>{messages[index]}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  skeletonArea: {
    flex: 1,
  },
  skeletonSpacer: {
    height: spacing.md,
  },
  messageArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    marginBottom: 0,
  },
  messageWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  sentence: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
  },
});
