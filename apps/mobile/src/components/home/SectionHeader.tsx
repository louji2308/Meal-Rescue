import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '../motion/Pressable';

import { Text } from '../AppText';
import { colors, fonts } from '../../theme';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

/** Editorial section header — left title, quiet right-aligned "See all". */
export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel={`${title}, see all`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.homeInk,
  },
  seeAll: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.homeTextFaint,
  },
});