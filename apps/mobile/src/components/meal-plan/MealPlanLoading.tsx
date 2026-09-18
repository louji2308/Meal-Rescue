import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { FadeInView } from '../motion/FadeInView';
import { Text } from '../AppText';

const SENTENCES = [
  'Reading your taste memory...',
  'Checking what\'s in the kitchen...',
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
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      setIndex(0);
      fadeAnim.setValue(1);
      return;
    }

    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % SENTENCES.length);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [visible, fadeAnim]);

  if (!visible) return null;

  return (
    <FadeInView duration={600} style={styles.container}>
      <View style={styles.content}>
        <Ionicons
          name="fitness"
          size={96}
          color={colors.primary}
          style={styles.icon}
        />
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.sentence}>{SENTENCES[index]}</Text>
        </Animated.View>
      </View>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  icon: {
    marginBottom: spacing.xl,
  },
  sentence: {
    ...typography.heading,
    color: colors.text,
    textAlign: 'center',
    fontSize: 22,
  },
});
