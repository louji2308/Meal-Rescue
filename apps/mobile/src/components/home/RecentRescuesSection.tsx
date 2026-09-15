import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '../motion/Pressable';

import { Text } from '../AppText';
import { SectionHeader } from './SectionHeader';
import { ChevronRightIcon, SparkIcon } from '../icons';
import type { RecentRescue } from '../../stores/rescues.store';
import { colors, fonts } from '../../theme';

interface RecentRescuesSectionProps {
  items: RecentRescue[];
  onItemPress: (item: RecentRescue) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Last few completed rescues — the proof the loop works. */
export function RecentRescuesSection({ items, onItemPress }: RecentRescuesSectionProps) {
  if (items.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Recent rescues" />
      <View style={styles.list}>
        {items.slice(0, 3).map((item) => (
          <Pressable
            key={item.id}
            style={styles.card}
            onPress={() => onItemPress(item)}
            accessibilityRole="button"
            accessibilityLabel={`Recent rescue: ${item.recommendation}`}
          >
            <View style={styles.tile}>
              <SparkIcon size={18} color={colors.homeButton} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.recommendation} numberOfLines={1}>
                {item.recommendation}
              </Text>
              <Text style={styles.foods} numberOfLines={1}>
                {item.foods.join(', ')}
              </Text>
            </View>
            <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
            <ChevronRightIcon size={14} color={colors.homeTextQuiet} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    marginTop: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.homeSurface,
    paddingHorizontal: 10,
    gap: 12,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.homeCardSage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  recommendation: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.homeInk,
  },
  foods: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.homeTextFaint,
    marginTop: 1,
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.homeTextTertiary,
  },
});