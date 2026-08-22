import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PersonalizationInsight, PreferenceLearned } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import { getLearnedPreferences, getPersonalizationInsights } from '../services/preference.api';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing, typography } from '../theme';

/**
 * Profile - identity, subscription, learned preferences, and insights.
 * Shows what Meal Rescue has learned about you.
 */
export function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [preferences, setPreferences] = useState<PreferenceLearned[]>([]);
  const [insights, setInsights] = useState<PersonalizationInsight[]>([]);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

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
    if (score >= 0.7) return colors.primary;
    if (score >= 0.4) return '#F57F00';
    return colors.textSecondary;
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'favorite_ingredient':
        return '❤️';
      case 'avoided_ingredient':
        return '🚫';
      case 'prep_tolerance':
        return '⚡';
      case 'time_pattern':
        return '⏱';
      case 'rescue_pattern':
        return '🔄';
      default:
        return '💡';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <Text style={[typography.heading, styles.email]}>{user?.email}</Text>
          <Text style={[typography.caption, styles.tier]}>
            {user?.subscriptionTier === 'pro' ? 'Pro plan' : 'Free plan · 3 rescues/day'}
          </Text>
        </View>

        <ErrorBanner error={error} />

        {insights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionIcon}>🧠</Text>
              What Meal Rescue has learned
            </Text>
            {insights.map((insight, i) => (
              <View key={i} style={styles.insightCard}>
                <Text style={styles.insightIcon}>{typeIcon(insight.type)}</Text>
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
            <Text style={styles.sectionTitle}>
              <Text style={styles.sectionIcon}>📊</Text>
              Learned preferences
            </Text>
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
            <Text style={styles.emptyIcon}>🧠</Text>
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
  email: {
    marginBottom: spacing.xs,
  },
  tier: {
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionIcon: {
    fontSize: 20,
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
    fontSize: 24,
  },
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
    fontSize: 48,
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
