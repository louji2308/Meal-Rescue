import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import HOME_CAT from '../../assets/home-cat.png';
import { Text } from '../components/AppText';
import {
  BellIcon,
  ClockIcon,
  FoodIcon,
  LeafIcon,
  ServingIcon,
  SparkIcon,
  UsersIcon,
  UtensilsIcon,
} from '../components/icons';
import { FadeInView } from '../components/motion/FadeInView';
import { PressableScale } from '../components/motion/PressableScale';
import type {
  HomeStackParamList,
  RootStackParamList,
  RootTabParamList,
} from '../navigation/AppNavigator';
import { selectUnreadCount, useNotificationsStore } from '../stores/notifications.store';
import { useSettingsStore } from '../stores/settings.store';
import { colors, fonts, radius, spacing } from '../theme';

type MealTime = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late';

function getMealTime(): MealTime {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 21) return 'dinner';
  return 'late';
}

const MEAL_OPTIONS: Record<MealTime, { prompt: string; sub: string; icon: React.ReactNode }> = {
  breakfast: {
    prompt: "What's for breakfast?",
    sub: 'Start the day right',
    icon: <SparkIcon size={20} color={colors.homeSurface} />,
  },
  lunch: {
    prompt: "What's for lunch?",
    sub: 'Fuel your afternoon',
    icon: <UtensilsIcon size={20} color={colors.homeSurface} />,
  },
  snack: {
    prompt: 'Snack time?',
    sub: 'Something quick and easy',
    icon: <ServingIcon size={20} color={colors.homeSurface} />,
  },
  dinner: {
    prompt: "What's for dinner?",
    sub: 'Make it count tonight',
    icon: <FoodIcon size={20} color={colors.homeSurface} />,
  },
  late: {
    prompt: 'Late night craving?',
    sub: 'We got you',
    icon: <ClockIcon size={20} color={colors.homeSurface} />,
  },
};

/**
 * Home — a single static landing page. Big cat, one question, and exactly
 * the rescue actions. Nothing scrolls, no cards, no sections.
 */
export function HomeScreen() {
  const navigation =
    useNavigation<
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

  const mealTime = getMealTime();
  const meal = MEAL_OPTIONS[mealTime];

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

      <FadeInView duration={300} rise={10} style={styles.fadeWrap}>
        <View style={styles.content}>
          {/* ── Cat ── */}
          <Image source={HOME_CAT} style={styles.cat} contentFit="contain" />

          {/* ── Greeting ── */}
          <Text style={styles.greeting}>Something smells good.</Text>

          {/* ── Question ── */}
          <Text style={styles.question}>Let's make your meal{'\n'}something better!</Text>

          {/* ── Actions ── */}
          <View style={styles.actions}>
            {/* Primary pill — Time-aware meal prompt */}
            <PressableScale
              style={styles.pill}
              scaleTo={0.97}
              pressedTintOpacity={1}
              pressedTintColor={colors.homeButtonPressed}
              onPress={goToCapture}
              accessibilityRole="button"
              accessibilityLabel={meal.prompt}
            >
              {meal.icon}
              <View style={styles.pillTextGroup}>
                <Text style={styles.pillText}>{meal.prompt}</Text>
                <Text style={styles.pillSubtext}>{meal.sub}</Text>
              </View>
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
      </FadeInView>
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
  fadeWrap: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 20,
  },

  /* ── Cat ── */
  cat: {
    width: 240,
    height: 213,
    marginBottom: 12,
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
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.3,
    color: colors.homeInk,
    textAlign: 'center',
    marginBottom: 24,
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
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.homeButton,
    paddingHorizontal: 20,
  },
  pillTextGroup: {
    alignItems: 'flex-start',
  },
  pillText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.homeSurface,
  },
  pillSubtext: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 1,
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
