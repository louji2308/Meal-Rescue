import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PersonalizationInsight, PreferenceLearned } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { getAdEligibility } from '../services/ads.api';
import { toApiError } from '../services/api';
import { getLearnedPreferences, getPersonalizationInsights } from '../services/preference.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

const APK_VERSION = '0.1.0';
const NOTIFICATIONS_KEY = 'meal-rescue/notifications-enabled';
const SUPPORT_EMAIL = 'support@mealrescue.app';

/**
 * Profile - identity, subscription, learned preferences, and insights.
 * Shows what Meal Rescue has learned about you.
 */
export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [preferences, setPreferences] = useState<PreferenceLearned[]>([]);
  const [insights, setInsights] = useState<PersonalizationInsight[]>([]);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [tier, setTier] = useState<'free' | 'pro' | null>(null);
  const [rescueCredits, setRescueCredits] = useState(0);
  const [notificationsOn, setNotificationsOn] = useState(true);

  useEffect(() => {
    loadProfile();
    AsyncStorage.getItem(NOTIFICATIONS_KEY).then((val) => {
      if (val !== null) setNotificationsOn(val === 'true');
    });
  }, []);

  const refreshMonetization = useCallback(() => {
    getAdEligibility()
      .then((eligibility) => {
        setTier(eligibility.tier);
        setRescueCredits(eligibility.rescueCredits);
      })
      .catch(() => setTier(null));
  }, []);

  useEffect(() => {
    refreshMonetization();
  }, [refreshMonetization]);

  async function handleToggleNotifications(next: boolean) {
    setNotificationsOn(next);
    await AsyncStorage.setItem(NOTIFICATIONS_KEY, String(next));
  }

  async function loadProfile() {
    try {
      const [prefs, ins] = await Promise.all([
        getLearnedPreferences(),
        getPersonalizationInsights(),
      ]);
      setPreferences(prefs);
      setInsights(ins);
    } catch (err) {
      setError(toApiError(err));
    }
  }

  const confidenceColor = (score: number) => {
    if (score >= 0.7) return colors.success;
    if (score >= 0.4) return colors.secondary;
    return colors.textSecondary;
  };

  const typeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'favorite_ingredient':
        return 'heart-outline';
      case 'avoided_ingredient':
        return 'ban-outline';
      case 'prep_tolerance':
        return 'flash-outline';
      case 'time_pattern':
        return 'time-outline';
      case 'rescue_pattern':
        return 'sync-outline';
      default:
        return 'bulb-outline';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Text style={[typography.heading, styles.email]}>{user?.email}</Text>
          <Text style={[typography.caption, styles.tier]}>
            {tier === 'pro' || user?.subscriptionTier === 'pro'
              ? 'Pro plan'
              : `Free plan · 3 rescues/day${rescueCredits > 0 ? ` · +${rescueCredits} bonus` : ''}`}
          </Text>
        </View>

        {tier === 'free' && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Meal Rescue Pro"
            onPress={() => navigation.navigate('Paywall')}
            style={styles.proRow}
            activeOpacity={0.7}
          >
            <View style={styles.proLeft}>
              <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
              <View>
                <Text style={styles.proTitle}>Meal Rescue Pro</Text>
                <Text style={styles.proSub}>
                  {rescueCredits > 0
                    ? `${rescueCredits} rescue credits`
                    : 'Unlimited daily rescues'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
            <Text style={styles.sectionTitleText}>Settings</Text>
          </View>

          <View style={styles.settingRow}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            <View style={styles.settingLabel}>
              <Text style={styles.settingTitle}>Reminders</Text>
              <Text style={styles.settingSub}>Rescue reminders and smart nudges</Text>
            </View>
            <Switch
              accessibilityLabel="Toggle reminders"
              value={notificationsOn}
              onValueChange={(v) => void handleToggleNotifications(v)}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.surface}
            />
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Contact support"
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={styles.settingRow}
            activeOpacity={0.7}
          >
            <Ionicons name="mail-outline" size={22} color={colors.text} />
            <View style={styles.settingLabel}>
              <Text style={styles.settingTitle}>Support</Text>
              <Text style={styles.settingSub}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <Ionicons name="information-circle-outline" size={22} color={colors.text} />
            <View style={styles.settingLabel}>
              <Text style={styles.settingTitle}>About Meal Rescue</Text>
              <Text style={styles.settingSub}>Version {APK_VERSION}</Text>
            </View>
          </View>
        </View>

        <ErrorBanner error={error} />

        {insights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Ionicons name="sparkles-outline" size={20} color={colors.text} />
              <Text style={styles.sectionTitleText}>What Meal Rescue has learned</Text>
            </View>
            {insights.map((insight, i) => (
              <View key={i} style={styles.insightCard}>
                <Ionicons
                  name={typeIcon(insight.type)}
                  size={24}
                  color={colors.text}
                  style={styles.insightIcon}
                />
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
            ))}
          </View>
        )}

        {preferences.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Ionicons name="stats-chart-outline" size={20} color={colors.text} />
              <Text style={styles.sectionTitleText}>Learned preferences</Text>
            </View>
            {preferences.map((pref, i) => (
              <View key={i} style={styles.prefCard}>
                <Text style={styles.prefType}>{pref.preferenceType}</Text>
                <Text style={styles.prefKey}>{pref.preferenceKey}</Text>
                <Text
                  style={[styles.prefConfidence, { color: confidenceColor(pref.confidenceScore) }]}
                >
                  {Math.round(pref.confidenceScore * 100)}% confidence · {pref.observationCount}{' '}
                  observations
                </Text>
              </View>
            ))}
          </View>
        )}

        {insights.length === 0 && preferences.length === 0 && (
          <View style={styles.empty}>
            <Ionicons
              name="sparkles-outline"
              size={48}
              color={colors.textSecondary}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyText}>No learnings yet</Text>
            <Text style={styles.emptySub}>
              Rescue meals and give feedback to build your profile
            </Text>
          </View>
        )}

        <PrimaryButton
          label="Sign out"
          variant="ghost"
          onPress={clearSession}
          style={styles.signOut}
        />
      </ScrollView>
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  proSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  email: {
    marginBottom: spacing.xs,
  },
  tier: {
    marginBottom: spacing.xl,
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  settingSub: {
    fontSize: 13,
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
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
  insightIcon: {},
  insightContent: {
    flex: 1,
  },
  insightDesc: {
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  insightMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  insightConfidence: {
    fontSize: 11,
    fontWeight: '600',
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  prefKey: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  prefConfidence: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  signOut: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
});
