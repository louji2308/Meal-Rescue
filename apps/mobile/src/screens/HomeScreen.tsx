import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import HOME_CAT from '../../assets/home-cat.png';

import { Text } from '../components/AppText';
import {
  BellIcon,
  FoodIcon,
  UsersIcon,
  LeafIcon,
} from '../components/icons';
import { PressableScale } from '../components/motion/PressableScale';
import type {
  HomeStackParamList,
  RootStackParamList,
  RootTabParamList,
} from '../navigation/AppNavigator';
import { useSettingsStore } from '../stores/settings.store';
import { useNotificationsStore, selectUnreadCount } from '../stores/notifications.store';
import { colors, fonts, radius, spacing } from '../theme';

/**
 * Home — a single static landing page. Big cat, one question, and exactly
 * the rescue actions. Nothing scrolls, no cards, no sections.
 */
export function HomeScreen() {
  const navigation = useNavigation<
    NativeStackNavigationProp<HomeStackParamList & RootStackParamList & RootTabParamList>
  >();
  const kitchenImportEnabled = useSettingsStore((s) => s.kitchenImportEnabled);
  const setKitchenImportEnabled = useSettingsStore((s) => s.setKitchenImportEnabled);
  const unread = useNotificationsStore(selectUnreadCount);

  useEffect(() => {
    void useSettingsStore.getState().hydrate();
    void useNotificationsStore.getState().hydrate();
  }, []);

  const goToCapture = () => navigation.navigate('Capture');
  const goToFamily = () => navigation.navigate('CommonTableStack');
  const goToNotifications = () => navigation.navigate('Notifications');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ── Top bar: bell only ── */}
      <View style={styles.topBar}>
        <PressableScale
          style={styles.bellButton}
          scaleTo={0.9}
          onPress={goToNotifications}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <BellIcon size={22} color={colors.homeInk} />
          {unread > 0 && <View style={styles.unreadDot} />}
        </PressableScale>
      </View>

      <View style={styles.content}>
        {/* ── Cat ── */}
        <Image source={HOME_CAT} style={styles.cat} contentFit="contain" contentPosition="bottom" />

        {/* ── Greeting ── */}
        <Text style={styles.greeting}>Something smells good.</Text>

        {/* ── Question ── */}
        <Text style={styles.question}>Let's make your meal{'\n'}something better!</Text>

        {/* ── Actions ── */}
        <View style={styles.actions}>
          {/* Primary pill — Tell us what's here */}
          <PressableScale
            style={styles.pill}
            scaleTo={0.97}
            pressedTintOpacity={1}
            pressedTintColor={colors.homeButtonPressed}
            onPress={goToCapture}
            accessibilityRole="button"
            accessibilityLabel="Tell us what's here"
          >
            <FoodIcon size={20} color={colors.homeSurface} />
            <Text style={styles.pillText}>Tell us what's here</Text>
          </PressableScale>

          {/* Pill row — Cook for the family */}
          <PressableScale
            style={styles.boxRow}
            scaleTo={0.98}
            pressedTintOpacity={0.05}
            onPress={goToFamily}
            accessibilityRole="button"
            accessibilityLabel="Cook for the family"
          >
            <View style={styles.boxRowLeft}>
              <UsersIcon size={18} color={colors.homeInk} />
              <Text style={styles.boxRowText}>Cook for the family</Text>
            </View>
          </PressableScale>

          {/* Import kitchen toggle */}
          <PressableScale
            style={styles.importCard}
            scaleTo={0.98}
            pressedTintOpacity={0.04}
            onPress={() => setKitchenImportEnabled(!kitchenImportEnabled)}
            accessibilityRole="switch"
            accessibilityState={{ checked: kitchenImportEnabled }}
            accessibilityLabel="Import kitchen to AI"
          >
            <View style={styles.importCardTop}>
              <View style={styles.importCardLeft}>
                <LeafIcon
                  size={18}
                  color={kitchenImportEnabled ? colors.kitchenFresh : colors.homeTextQuiet}
                />
                <Text style={styles.importCardTitle}>Import kitchen</Text>
              </View>
              <Switch
                value={kitchenImportEnabled}
                onValueChange={setKitchenImportEnabled}
                trackColor={{ true: colors.kitchenPillActive, false: '#D8D6CD' }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text style={styles.importCardDesc}>
              {kitchenImportEnabled
                ? 'The rescuer can see everything in your kitchen.'
                : 'Your kitchen stays invisible. The AI knows nothing.'}
            </Text>
          </PressableScale>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* ── Top bar ── */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(22, 22, 22, 0.08)',
  },
  unreadDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.homeAlert,
  },

  /* ── Main content ── */
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
    gap: 0,
  },

  /* ── Cat ── */
  cat: {
    width: 220,
    height: 200,
    marginBottom: 16,
  },

  /* ── Greeting (uncommon, not "Good morning") ── */
  greeting: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.homeTextTertiary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.2,
    textTransform: 'lowercase',
  },

  /* ── Question ── */
  question: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 33,
    letterSpacing: -0.3,
    color: colors.homeInk,
    textAlign: 'center',
    marginBottom: 36,
  },

  /* ── Actions ── */
  actions: {
    alignSelf: 'stretch',
    gap: 14,
  },

  /* Pill — primary CTA */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.homeButton,
  },
  pillText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.homeSurface,
  },

  /* Pill row — Cook for the family */
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: '#F4F4F6',
  },
  boxRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  boxRowText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.homeInk,
  },

  /* Import kitchen toggle card */
  importCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(22, 22, 22, 0.10)',
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  importCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importCardTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.homeInk,
  },
  importCardDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeTextFaint,
    marginTop: 8,
  },
});
