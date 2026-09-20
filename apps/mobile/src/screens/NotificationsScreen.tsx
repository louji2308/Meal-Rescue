import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { BellIcon, ChevronLeftIcon, LeafIcon, SparkIcon } from '../components/icons';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { requestNotificationSnooze } from '../services/notifications.api';
import { parseDeepLink } from '../services/onesignal.service';
import {
  InAppNotification,
  InAppNotificationKind,
  selectUnreadCount,
  useNotificationsStore,
} from '../stores/notifications.store';
import { colors, fonts } from '../theme';

const KIND_META: Record<InAppNotificationKind, { label: string; hint: string }> = {
  spoiler_alert: { label: 'Spoiler alert', hint: 'Something in your kitchen is about to turn' },
  rescue_window: { label: 'Rescue window', hint: 'A rescue opportunity is closing soon' },
  aftercare: { label: 'Check-in', hint: 'How did the rescue work out?' },
  promo: { label: 'Meal Rescue', hint: 'News and tips' },
  push: { label: 'Meal Rescue', hint: 'Update' },
  system: { label: 'System', hint: 'About your account' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function KindGlyph({ kind }: { kind: InAppNotificationKind }) {
  const size = 17;
  const color = colors.homeButton;
  if (kind === 'spoiler_alert') return <LeafIcon size={size} color={color} />;
  if (kind === 'aftercare') return <SparkIcon size={size} color={color} />;
  return <BellIcon size={size} color={color} />;
}

function NotificationRow({ item }: { item: InAppNotification }) {
  const [snoozing, setSnoozing] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const snoozeable = item.kind === 'spoiler_alert';

  const handleSnooze = async () => {
    if (snoozing || snoozed) return;
    if (item.kind !== 'spoiler_alert') return;
    setSnoozing(true);
    try {
      await requestNotificationSnooze(item.kind, 12);
    } catch {
      // Best-effort: still mark handled if the backend is unreachable.
    } finally {
      setSnoozed(true);
      setSnoozing(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={[styles.glyphTile, item.read ? styles.glyphTileRead : null]}>
        <KindGlyph kind={item.kind} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, item.read ? styles.rowTitleRead : null]}>{item.title}</Text>
        <Text style={[styles.rowBodyText, item.read ? styles.rowBodyTextRead : null]}>
          {item.body}
        </Text>
        <Text style={styles.rowMeta}>{KIND_META[item.kind].hint}</Text>
        {snoozeable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remind me later for ${KIND_META[item.kind].label}`}
            onPress={handleSnooze}
            disabled={snoozing || snoozed}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.snoozeText, snoozed ? styles.snoozedText : null]}>
              {snoozed ? 'Snoozed for 12 hours' : 'Remind me later · 12h'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.rowTail}>
        <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </View>
    </View>
  );
}

function PulsingBell() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.12, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.emptyIcon}>
      <Animated.View style={animatedStyle}>
        <BellIcon size={26} color={colors.homeButton} />
      </Animated.View>
    </View>
  );
}

/**
 * Notification inbox. Reads pushes recorded from OneSignal (foreground +
 * click events), lets the user sweep them read and snooze the reminder
 * engines. Empty state stays honest: nothing invented.
 */
export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore(selectUnreadCount);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    void useNotificationsStore.getState().hydrate();
  }, []);

  const handlePressItem = (item: InAppNotification) => {
    haptics.light();
    markRead(item.id);
    if (item.deepLink) {
      const parsed = parseDeepLink(item.deepLink);
      if (parsed) {
        navigation.goBack();
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.back}
        >
          <ChevronLeftIcon size={22} color={colors.homeInk} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all notifications as read"
          onPress={() => {
            haptics.light();
            markAllRead();
          }}
          disabled={unread === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.markAllWrap}
        >
          <Text style={[styles.markAll, unread === 0 ? styles.markAllDisabled : null]}>
            Mark all read
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <FadeInView style={styles.empty}>
          <PulsingBell />
          <Text style={styles.emptyTitle}>You're all caught up</Text>
          <Text style={styles.emptyBody}>
            When Meal Rescue sends reminders about expiring food or a good time to cook, they'll
            show up here.
          </Text>
        </FadeInView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <FadeInView delay={index * 60} rise={4}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${KIND_META[item.kind].label}: ${item.title}`}
                onPress={() => handlePressItem(item)}
              >
                <NotificationRow item={item} />
              </Pressable>
            </FadeInView>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.homeInk,
  },
  markAllWrap: {
    width: 86,
    alignItems: 'flex-end',
  },
  markAll: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.homeButton,
  },
  markAllDisabled: {
    color: colors.homeTextTertiary,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
  },
  glyphTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.homeTintNeutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphTileRead: {
    backgroundColor: 'rgba(22,22,22,0.05)',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.homeInk,
  },
  rowTitleRead: {
    color: colors.homeTextSecondary,
  },
  rowBodyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeTextSecondary,
    marginTop: 1,
  },
  rowBodyTextRead: {
    color: colors.homeTextTertiary,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.homeTextTertiary,
    marginTop: 3,
  },
  snoozeText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.homeTextQuiet,
    marginTop: 8,
  },
  snoozedText: {
    color: colors.homeTextSecondary,
  },
  rowTail: {
    alignItems: 'flex-end',
    gap: 6,
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.homeTextTertiary,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.homeAlert,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.homeTintNeutral,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.homeInk,
    marginBottom: 6,
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.homeTextSecondary,
    textAlign: 'center',
  },
});
