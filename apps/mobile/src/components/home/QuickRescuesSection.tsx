import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../AppText';
import { SectionHeader } from './SectionHeader';
import { CameraIcon, ChevronRightIcon, PackageIcon } from '../icons';
import { PressableScale } from '../motion/PressableScale';
import { colors, fonts } from '../../theme';

interface QuickRescuesSectionProps {
  onScan: () => void;
  onPantry: () => void;
  onSeeAll: () => void;
}

interface QuickCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  tint: string;
  onPress: () => void;
}

function QuickCard({ title, description, icon, tint, onPress }: QuickCardProps) {
  return (
    <PressableScale
      style={[styles.card, { backgroundColor: tint }]}
      scaleTo={0.98}
      pressedTintOpacity={0.05}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${description}`}
    >
      {icon}
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{description}</Text>
      <View style={styles.cardChevron}>
        <ChevronRightIcon size={14} color={colors.homeTextQuiet} />
      </View>
    </PressableScale>
  );
}

/** Two-column grid of one-tap rescue shortcuts. */
export function QuickRescuesSection({ onScan, onPantry, onSeeAll }: QuickRescuesSectionProps) {
  return (
    <View>
      <SectionHeader title="Quick rescues" onSeeAll={onSeeAll} />
      <View style={styles.grid}>
        <QuickCard
          title="Scan leftovers"
          description="Find a rescue"
          icon={<CameraIcon size={20} color={colors.homeButton} />}
          tint={colors.homeCardSage}
          onPress={onScan}
        />
        <QuickCard
          title="Use pantry"
          description="Get ideas"
          icon={<PackageIcon size={20} color={colors.homeButton} />}
          tint={colors.homeCardPeach}
          onPress={onPantry}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  card: {
    flex: 1,
    height: 148,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
  },
  cardIcon: {
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeInk,
  },
  cardDesc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.homeTextFaint,
    marginTop: 2,
  },
  cardChevron: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});