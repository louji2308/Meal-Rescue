import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../AppText';
import { SectionHeader } from './SectionHeader';
import { ChevronRightIcon, LeafIcon, UtensilsIcon } from '../icons';
import { PressableScale } from '../motion/PressableScale';
import { colors, fonts } from '../../theme';

export interface RescuingItem {
  id: string;
  name: string;
  subtitle: string;
  kind: 'pantry' | 'leftover';
}

interface NeedsRescuingSectionProps {
  items: RescuingItem[];
  onSeeAll: () => void;
  onItemPress: (item: RescuingItem) => void;
}

const KIND_TINT: Record<RescuingItem['kind'], string> = {
  pantry: colors.homeCardSage,
  leftover: colors.homeCardBlush,
};

/** White row cards for food that needs attention right now. */
export function NeedsRescuingSection({ items, onSeeAll, onItemPress }: NeedsRescuingSectionProps) {
  return (
    <View>
      <SectionHeader title="Needs rescuing" onSeeAll={onSeeAll} />
      <View style={styles.list}>
        {items.map((item) => (
          <PressableScale
            key={item.id}
            style={styles.card}
            scaleTo={0.98}
            pressedTintOpacity={0.04}
            onPress={() => onItemPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.subtitle}`}
          >
            <View style={[styles.tile, { backgroundColor: KIND_TINT[item.kind] }]}>
              {item.kind === 'pantry' ? (
                <LeafIcon size={22} color={colors.homeButton} />
              ) : (
                <UtensilsIcon size={22} color={colors.homeButton} />
              )}
            </View>
            <View style={styles.textCol}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
            <ChevronRightIcon size={14} color={colors.homeTextQuiet} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
    marginTop: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 80,
    borderRadius: 18,
    backgroundColor: colors.homeSurface,
    paddingHorizontal: 8,
    gap: 12,
    overflow: 'hidden',
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.homeInk,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.homeTextFaint,
    marginTop: 1,
  },
});