import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PersonalizationInsight, PreferenceLearned } from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Skeleton } from '../components/Skeleton';
import {
  BanIcon,
  BellIcon,
  BookIcon,
  BulbIcon,
  ChevronRightIcon,
  ClockIcon,
  FlashIcon,
  HeartIcon,
  InfoIcon,
  MailIcon,
  SettingsIcon,
  SparkIcon,
  StatsIcon,
  SyncIcon,
  UsersIcon,
} from '../components/icons';
import { PawStamp } from '../components/mascot/PawStamp';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { api, toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import { getLearnedPreferences, getPersonalizationInsights } from '../services/preference.api';
import { getTasteBundle } from '../services/taste.api';
import { useAuthStore } from '../stores/auth.store';
import { useCommonTableStore } from '../stores/common-table.store';
import { useMonetization } from '../stores/monetization.store';
import { colors, fonts, spacing, typography } from '../theme';

const APK_VERSION = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? '0.1.0';
const NOTIFICATIONS_KEY = 'meal-rescue/notifications-enabled';
const SUPPORT_EMAIL = 'get.mealrescue@gmail.com';

/**
 * Profile - identity, subscription, learned preferences, and insights.
 * Shows what Meal Rescue has learned about you.
 */
export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const household = useCommonTableStore((state) => state.household);
  const members = useCommonTableStore((state) => state.members);
  const loadHousehold = useCommonTableStore((state) => state.loadHousehold);

  const [preferences, setPreferences] = useState<PreferenceLearned[]>([]);
  const [insights, setInsights] = useState<PersonalizationInsight[]>([]);
  const [tasteCount, setTasteCount] = useState(0);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const tier = useMonetization((state) => state.tier);
  const rescueCredits = useMonetization((state) => state.rescueCredits);
  const refresh = useMonetization((state) => state.refresh);
  const isEffectivePro = tier === 'pro' || user?.subscriptionTier === 'pro';
  const lastLoadedAt = useRef(0);

  const loadProfile = useCallback(
    async (mode: 'initial' | 'refresh' | 'background' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'initial' && !lastLoadedAt.current) setProfileLoading(true);
      try {
        const [prefs, ins, bundle] = await Promise.all([
          getLearnedPreferences(),
          getPersonalizationInsights(),
          getTasteBundle().catch(() => null),
        ]);
        setPreferences(prefs);
        setInsights(ins);
        if (bundle) {
          setTasteCount(bundle.journal.length + (bundle.memories?.length ?? 0));
        }
        lastLoadedAt.current = Date.now();
        setError(null);
      } catch (err) {
        setError(toApiError(err));
      } finally {
        setProfileLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadProfile();
    void loadHousehold().catch((err) => {
      console.warn('[ProfileScreen] household load failed:', err);
    });
    void refresh();
    AsyncStorage.getItem(NOTIFICATIONS_KEY).then((val) => {
      if (val !== null) setNotificationsOn(val === 'true');
    });
  }, [refresh, loadHousehold]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadedAt.current > 60_000) {
        void loadProfile('background');
      }
    }, [loadProfile]),
  );

  async function handleToggleNotifications(next: boolean) {
    setNotificationsOn(next);
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, String(next));
  }

  const confidenceColor = (score: number) => {
    if (score >= 0.7) return colors.success;
    if (score >= 0.4) return colors.secondary;
    return colors.textSecondary;
  };

  const typeIcon = (type: string): React.ReactNode => {
    const iconProps = { size: 18, color: colors.homeInk };
    switch (type) {
      case 'favorite_ingredient':
        return <HeartIcon {...iconProps} />;
      case 'avoided_ingredient':
        return <BanIcon {...iconProps} />;
      case 'prep_tolerance':
        return <FlashIcon {...iconProps} />;
      case 'time_pattern':
        return <ClockIcon {...iconProps} />;
      case 'rescue_pattern':
        return <SyncIcon {...iconProps} />;
      default:
        return <BulbIcon {...iconProps} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {profileLoading ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton height={20} width="55%" style={{ marginBottom: spacing.sm }} />
          <Skeleton height={14} width="35%" />
          <Skeleton height={64} borderRadius={12} style={{ marginTop: spacing.lg }} />
          <Skeleton lines={3} height={52} borderRadius={12} style={{ marginTop: spacing.lg }} />
        </ScrollView>
      ) : (
        <FadeInView style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadProfile('refresh')}
                tintColor={colors.textSecondary}
              />
            }
          >
            <View style={styles.identity}>
              <Text style={[typography.heading, styles.email]}>{user?.email}</Text>
              <View style={[styles.tierRow, styles.tier]}>
                {isEffectivePro && <PawStamp size={16} rotation={0} />}
                <Text style={typography.caption}>
                  {isEffectivePro
                    ? 'Pro plan'
                    : `Free plan \u2022 3 rescues/day${rescueCredits > 0 ? ` \u2022 +${rescueCredits} bonus` : ''}`}
                </Text>
              </View>
            </View>

            {tier === 'free' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Meal Rescue Pro"
                onPress={() => navigation.navigate('Paywall')}
                style={styles.proRow}
                tintBorderRadius={12}
              >
                <View style={styles.proLeft}>
                  <PawStamp size={24} rotation={0} />
                  <View>
                    <Text style={styles.proTitle}>Meal Rescue Pro</Text>
                    <Text style={styles.proSub}>
                      {rescueCredits > 0
                        ? `${rescueCredits} rescue credits`
                        : 'Unlimited daily rescues'}
                    </Text>
                  </View>
                </View>
                <ChevronRightIcon size={18} color={colors.homeTextQuiet} />
              </Pressable>
            )}

            <View style={styles.section}>
              <View style={styles.sectionTitle}>
                <UsersIcon size={18} color={colors.homeInk} />
                <Text style={styles.sectionTitleText}>Common Table</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Common Table — add the people you cook for"
                onPress={() => navigation.navigate('CommonTableStack')}
                style={styles.settingRow}
                tintBorderRadius={12}
              >
                <UsersIcon size={18} color={colors.homeInk} />
                <View style={styles.settingLabel}>
                  <Text style={styles.settingTitle}>Add your partner</Text>
                  <Text style={styles.settingSub}>
                    {household
                      ? `One meal for everyone · ${members.length} at the table`
                      : 'Add the people you cook for to plan one meal together'}
                  </Text>
                </View>
                <ChevronRightIcon size={16} color={colors.homeTextQuiet} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionTitle}>
                <SettingsIcon size={18} color={colors.homeInk} />
                <Text style={styles.sectionTitleText}>Settings</Text>
              </View>

              <FadeInView delay={80} rise={4}>
                <View style={styles.settingRow}>
                  <BellIcon size={18} color={colors.homeInk} />
                  <View style={styles.settingLabel}>
                    <Text style={styles.settingTitle}>Reminders</Text>
                    <Text style={styles.settingSub}>Rescue reminders and smart nudges</Text>
                  </View>
                  <Switch
                    accessibilityLabel="Toggle reminders"
                    value={notificationsOn}
                    onValueChange={(v) => {
                      haptics.light();
                      void handleToggleNotifications(v);
                    }}
                    trackColor={{ true: colors.kitchenPillActive, false: colors.border }}
                    thumbColor={colors.surface}
                  />
                </View>
              </FadeInView>

              <FadeInView delay={120} rise={4}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Contact support"
                  onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
                  style={styles.settingRow}
                  tintBorderRadius={12}
                >
                  <MailIcon size={18} color={colors.homeInk} />
                  <View style={styles.settingLabel}>
                    <Text style={styles.settingTitle}>Support</Text>
                    <Text style={styles.settingSub}>{SUPPORT_EMAIL}</Text>
                  </View>
                  <ChevronRightIcon size={16} color={colors.homeTextQuiet} />
                </Pressable>
              </FadeInView>

              <FadeInView delay={160} rise={4}>
                <View style={styles.settingRow}>
                  <InfoIcon size={18} color={colors.homeInk} />
                  <View style={styles.settingLabel}>
                    <Text style={styles.settingTitle}>About Meal Rescue</Text>
                    <Text style={styles.settingSub}>Version {APK_VERSION}</Text>
                  </View>
                </View>
              </FadeInView>

              <FadeInView delay={200} rise={4}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open taste journal"
                  onPress={() => navigation.navigate('TasteJournal')}
                  style={styles.settingRow}
                  tintBorderRadius={12}
                >
                  <BookIcon size={18} color={colors.homeInk} />
                  <View style={styles.settingLabel}>
                    <Text style={styles.settingTitle}>Taste Journal</Text>
                    <Text style={styles.settingSub}>What Meal Rescue remembers about you</Text>
                  </View>
                  <ChevronRightIcon size={16} color={colors.homeTextQuiet} />
                </Pressable>
              </FadeInView>
            </View>

            <ErrorBanner error={error} />

            {insights.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionTitle}>
                  <SparkIcon size={18} color={colors.homeInk} />
                  <Text style={styles.sectionTitleText}>What Meal Rescue has learned</Text>
                </View>
                {insights.map((insight, i) => (
                  <FadeInView key={i} delay={i * 80 + 100} rise={4}>
                    <View style={styles.insightCard}>
                      <View style={styles.insightIcon}>{typeIcon(insight.type)}</View>
                      <View style={styles.insightContent}>
                        <Text style={styles.insightDesc}>{insight.description}</Text>
                        <View style={styles.insightMeta}>
                          <Text
                            style={[
                              styles.insightConfidence,
                              { color: confidenceColor(insight.confidence) },
                            ]}
                          >
                            Confidence: {Math.round(insight.confidence * 100)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </FadeInView>
                ))}
              </View>
            )}

            {preferences.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionTitle}>
                  <StatsIcon size={18} color={colors.homeInk} />
                  <Text style={styles.sectionTitleText}>Learned preferences</Text>
                </View>
                {preferences.map((pref, i) => (
                  <FadeInView key={i} delay={i * 80 + 100} rise={4}>
                    <View style={styles.prefCard}>
                      <Text style={styles.prefType}>{pref.preferenceType}</Text>
                      <Text style={styles.prefKey}>{pref.preferenceKey}</Text>
                      <Text
                        style={[
                          styles.prefConfidence,
                          { color: confidenceColor(pref.confidenceScore) },
                        ]}
                      >
                        {Math.round(pref.confidenceScore * 100)}% confidence ·{' '}
                        {pref.observationCount} observations
                      </Text>
                    </View>
                  </FadeInView>
                ))}
              </View>
            )}

            {insights.length === 0 && preferences.length === 0 && tasteCount === 0 && (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="leaf" size={56} color={colors.primary} />
                </View>
                <Text style={styles.emptyText}>No learnings yet</Text>
                <Text style={styles.emptySub}>
                  Rescue meals and give feedback to build your profile.{'\n'}Your preferences will
                  appear here once Meal Rescue gets to know you.
                </Text>
              </View>
            )}

            <PrimaryButton
              label="Sign out"
              variant="ghost"
              onPress={() => {
                Alert.alert('Sign out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: () => {
                      haptics.warning();
                      void clearSession();
                    },
                  },
                ]);
              }}
              style={styles.signOut}
            />

            <PrimaryButton
              label="Delete account"
              variant="ghost"
              onPress={() => {
                Alert.alert(
                  'Delete account',
                  'This will permanently delete your account and all associated data. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        haptics.warning();
                        void (async () => {
                          try {
                            await api.delete('/api/v1/user/account');
                            await clearSession();
                          } catch {
                            Alert.alert(
                              'Error',
                              'Failed to delete account. Please contact support.',
                            );
                          }
                        })();
                      },
                    },
                  ],
                );
              }}
              style={styles.deleteAccount}
            />
          </ScrollView>
        </FadeInView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: 120,
  },
  identity: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  proLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  proTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
  },
  proSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  email: {
    marginBottom: spacing.xs,
    fontFamily: fonts.display,
    fontWeight: '400',
  },
  tier: {
    marginBottom: spacing.xl,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  settingLabel: {
    flex: 1,
  },
  settingTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,
  },
  settingSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitleText: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '400',
    color: colors.homeTextSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.md,
  },
  insightIcon: {
    marginTop: 2,
  },
  insightContent: {
    flex: 1,
  },
  insightDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  insightMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  insightConfidence: {
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  prefCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  prefType: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  prefKey: {
    fontFamily: fonts.medium,
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  prefConfidence: {
    fontSize: 11,
    fontFamily: fonts.medium,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  emptyIcon: {
    marginBottom: spacing.md,
  },
  emptyText: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  signOut: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
  deleteAccount: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
