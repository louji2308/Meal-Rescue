import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '../AppText';
import { BellIcon, UserIcon } from '../icons';
import { PressableScale } from '../motion/PressableScale';
import { colors, fonts } from '../../theme';

interface HomeHeaderProps {
  greeting: string;
  /** Show the unread dot on the notification bell. */
  hasUnread?: boolean;
  onBellPress?: () => void;
  onAvatarPress?: () => void;
}

/**
 * Greeting + bell + profile avatar, pinned above the scroll so the header
 * stays visually stable while content scrolls underneath.
 */
export function HomeHeader({ greeting, hasUnread = false, onBellPress, onAvatarPress }: HomeHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.subtitle}>Let's rescue what's available.</Text>
      </View>
      <View style={styles.controls}>
        <PressableScale
          style={styles.bell}
          scaleTo={0.92}
          pressedTintOpacity={0.08}
          onPress={onBellPress}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          accessibilityHint={hasUnread ? 'You have unread notifications' : 'No unread notifications'}
        >
          <BellIcon size={17} color={colors.homeInk} />
          {hasUnread ? <View style={styles.unreadDot} /> : null}
        </PressableScale>
        <PressableScale
          style={styles.avatar}
          scaleTo={0.92}
          pressedTintOpacity={0.12}
          onPress={onAvatarPress}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <UserIcon size={16} color={colors.homeTextSecondary} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textCol: {
    flex: 1,
  },
  greeting: {
    fontFamily: fonts.serif,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.2,
    color: colors.homeInk,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.homeTextSecondary,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
    marginTop: 2,
  },
  bell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(22,22,22,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.homeAlert,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8E6E0',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});