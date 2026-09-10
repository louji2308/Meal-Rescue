import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OnboardingPair } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { answerOnboarding, startOnboarding } from '../services/taste.api';
import { colors, spacing } from '../theme';

/**
 * Taste Onboarding - 6 quick A/B questions that seed your taste profile.
 * "Which addition completes this meal better for you?"
 */
export function TasteOnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pair, setPair] = useState<OnboardingPair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [step, setStep] = useState(0);
  const [totalSteps] = useState(6);

  useEffect(() => {
    loadFirstPair();
  }, []);

  async function loadFirstPair() {
    setBusy(true);
    try {
      const result = await startOnboarding();
      if (result.pair) {
        setPair(result.pair);
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(selected: 'A' | 'B') {
    if (!pair) return;
    setBusy(true);
    setError(null);
    try {
      const result = await answerOnboarding({
        pairId: pair.id,
        selected,
        unavailableOption: null,
      });
      if (result.next) {
        setPair(result.next);
        setStep((s) => s + 1);
      } else {
        navigation.goBack();
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!pair && !error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading your taste quiz…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.skipButton}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {step + 1} of {totalSteps}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${((step + 1) / totalSteps) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.question}>{pair?.question}</Text>
        </View>

        <View style={styles.options}>
          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.8}
            onPress={() => handleAnswer('A')}
            disabled={busy || !pair}
          >
            <Text style={styles.optionEmoji}>{pair?.optionA.emoji}</Text>
            <Text style={styles.optionName}>{pair?.optionA.name}</Text>
            <Text style={styles.optionBlurb}>{pair?.optionA.blurb}</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <Text style={styles.orText}>or</Text>
          </View>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.8}
            onPress={() => handleAnswer('B')}
            disabled={busy || !pair}
          >
            <Text style={styles.optionEmoji}>{pair?.optionB.emoji}</Text>
            <Text style={styles.optionName}>{pair?.optionB.name}</Text>
            <Text style={styles.optionBlurb}>{pair?.optionB.blurb}</Text>
          </TouchableOpacity>
        </View>

        <ErrorBanner error={error} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  skipButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 1,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  progress: {
    marginBottom: spacing.xl,
  },
  progressText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26,
  },
  options: {
    gap: spacing.md,
  },
  option: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  optionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  optionBlurb: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  orDivider: {
    alignItems: 'center',
  },
  orText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
