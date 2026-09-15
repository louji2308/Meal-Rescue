import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { Text } from '../AppText';
import { CameraIcon, ChevronRightIcon, UsersIcon } from '../icons';
import { PressableScale } from '../motion/PressableScale';
import HOME_CAT from '../../../assets/home-cat.png';
import { colors, fonts } from '../../theme';

interface HeroCardProps {
  onCapture: () => void;
  onAddManual: () => void;
  onFamily: () => void;
  /** When true the primary CTA renders at 35% opacity and is inert. */
  disabled?: boolean;
}

/**
 * The single most important component on the page. Left-aligned editorial
 * serif headline, supporting cat mark, one dark primary CTA, then two quiet
 * secondary actions. Hierarchical: capture > add manually > cook for family.
 */
export function HeroCard({ onCapture, onAddManual, onFamily, disabled = false }: HeroCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.titleZone}>
        <Text style={styles.title}>What's on{'\n'}your plate?</Text>
        <Image
          source={HOME_CAT}
          style={styles.cat}
          contentFit="contain"
          accessibilityLabel="Scraps the rescue cat"
        />
      </View>
      <Text style={styles.desc}>Tell us what you have and we'll find the best next move.</Text>

      <PressableScale
        style={[styles.cta, ...(disabled ? [{ opacity: 0.35 }] : [])]}
        scaleTo={0.98}
        pressedTintOpacity={1}
        pressedTintColor={colors.homeButtonPressed}
        onPress={onCapture}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Tell us what's here"
        accessibilityState={{ disabled }}
      >
        <CameraIcon size={17} color={colors.homeSurface} />
        <Text style={styles.ctaText}>Tell us what's here</Text>
      </PressableScale>

      <PressableScale
        style={styles.addManual}
        scaleTo={0.97}
        pressedTintOpacity={0.05}
        onPress={onAddManual}
        accessibilityRole="button"
        accessibilityLabel="Add what you have manually"
      >
        <Text style={styles.addManualText}>Add manually</Text>
        <ChevronRightIcon size={12} color={colors.homeTextQuiet} />
      </PressableScale>

      <PressableScale
        style={styles.familyRow}
        scaleTo={0.98}
        pressedTintOpacity={0.06}
        pressedTintColor={colors.homeInk}
        onPress={onFamily}
        accessibilityRole="button"
        accessibilityLabel="Cook for the family"
      >
        <UsersIcon size={16} color={colors.homeInk} />
        <Text style={styles.familyText}>Cook for the family</Text>
        <ChevronRightIcon size={14} color={colors.homeTextQuiet} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.homeCardBlush,
    borderRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titleZone: {
    minHeight: 96,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 29,
    letterSpacing: -0.35,
    color: colors.homeInk,
  },
  cat: {
    position: 'absolute',
    top: 0,
    right: -4,
    width: 100,
    height: 90,
  },
  desc: {
    maxWidth: 190,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeTextSecondary,
    marginTop: -2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.homeButton,
    marginHorizontal: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  ctaText: {
    fontFamily: fonts.semiBold,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.homeSurface,
  },
  addManual: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  addManualText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.homeTextQuiet,
  },
  familyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 34,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginTop: 8,
    overflow: 'hidden',
  },
  familyText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeInk,
  },
});