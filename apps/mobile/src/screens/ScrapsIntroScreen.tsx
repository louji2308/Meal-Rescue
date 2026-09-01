import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/PrimaryButton';
import { PawStamp } from '../components/mascot/PawStamp';
import { colors, spacing, typography } from '../theme';

interface ScrapsIntroScreenProps {
  onFinish: (destination: 'home' | 'capture') => void;
}

/**
 * One-time "meet Scraps" moment shown to new users after sign-in.
 * Characters step in on a gentle stagger (no bounce, no noise).
 */
export function ScrapsIntroScreen({ onFinish }: ScrapsIntroScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.scene}>
          <Image
            source={require('../../assets/home-cat.png')}
            style={styles.cat}
            resizeMode="contain"
            accessibilityLabel="Scraps peeking over a plate"
          />
          <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.plate}>
            <View style={styles.rim} />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(450).duration(420)} style={styles.eyebrowRow}>
          <PawStamp size={14} />
          <Text style={styles.eyebrow}>Scraps</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(650).duration(420)}>
          <Text style={[typography.title, styles.headline]}>Hi, I&apos;m Scraps.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(850).duration(420)}>
          <Text style={[typography.body, styles.tagline]}>
            Show me what you&apos;re eating. I&apos;ll find a small thing that makes it better.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(1050).duration(450)} style={styles.ctaWrap}>
          <PrimaryButton
            label="Capture a meal"
            onPress={() => onFinish('capture')}
            style={styles.cta}
          />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(1350).duration(400)}>
          <TouchableOpacity
            onPress={() => onFinish('home')}
            accessibilityRole="button"
            accessibilityLabel="Skip this"
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
          >
            <Text style={styles.skip}>Skip this</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  scene: {
    width: 320,
    height: 300,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cat: {
    position: 'absolute',
    top: 6,
    width: 260,
    height: 231,
  },
  plate: {
    position: 'absolute',
    top: 104,
    width: 216,
    height: 216,
    borderRadius: 108,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.secondary,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headline: {
    marginBottom: spacing.sm,
  },
  tagline: {
    textAlign: 'center',
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  ctaWrap: {
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  cta: {
    borderRadius: 56,
  },
  skip: {
    color: colors.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
