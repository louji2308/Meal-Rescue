import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  RankedRecommendation,
  RescueCandidate,
  RescueGenerateResponse,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { generateRescue } from '../services/rescue.api';
import { colors, spacing, typography } from '../theme';

/**
 * The rescue result - deliberately plain (product spec):
 *   Your meal / Rescue / Why / Time · Effort
 * ONE recommendation plus at most TWO alternatives.
 * Exactly four actions: rescue, swap, dont_have, keep_as_is.
 */
export function RescueResultScreen({
  route,
}: {
  route: { params: { result: RescueGenerateResponse } };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const initial: RescueGenerateResponse = route.params.result;

  const [current, setCurrent] = useState(initial);
  const [chosen, setChosen] = useState<RankedRecommendation>(initial.recommendation);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  async function handleDontHave() {
    setError(null);
    setBusy(true);
    try {
      // Re-run the funnel excluding everything this suggestion needs.
      const avoid = [
        ...chosen.candidate.additions.map((addition) => addition.name),
        ...chosen.candidate.substitutions.map((substitution) => substitution.replacement.name),
      ];
      const next = await generateRescue(current.originalMeal.mealId, {
        avoidIngredients: avoid,
      });
      setCurrent(next);
      setChosen(next.recommendation);
      setSaved(false);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={[typography.title, styles.savedTitle]}>Enjoy your meal!</Text>
          <Text style={[typography.body, styles.savedText]}>
            Small change, better meal. Feedback and learning arrive in Phase 4.
          </Text>
          <PrimaryButton
            label="Back to home"
            onPress={() => navigation.popToTop()}
            style={styles.actionButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.caption, styles.mealLabel]}>
          Your meal: {current.originalMeal.foods.join(', ')}
        </Text>

        <View style={styles.card}>
          <Text style={[typography.heading, styles.rescueLine]}>
            {describeCandidate(chosen.candidate)}
          </Text>
          <Text style={[typography.body, styles.why]}>{chosen.naturalLanguageExplanation}</Text>
          <Text style={[typography.caption, styles.meta]}>{describeMeta(chosen.candidate)}</Text>
        </View>

        <ErrorBanner error={error} />

        <View style={styles.actions}>
          <PrimaryButton
            label="Rescue my meal"
            onPress={() => setSaved(true)}
            disabled={busy}
            style={styles.actionButton}
          />
          {current.alternatives.length > 0 && (
            <PrimaryButton
              label="Show me a swap"
              variant="secondary"
              onPress={() => setChosen(current.alternatives[0]!)}
              disabled={busy}
              style={styles.actionButton}
            />
          )}
          <PrimaryButton
            label="I don't have these"
            variant="ghost"
            onPress={() => void handleDontHave()}
            busy={busy}
            style={styles.actionButton}
          />
          <PrimaryButton
            label="Keep it as-is"
            variant="ghost"
            onPress={() => navigation.popToTop()}
            disabled={busy}
            style={styles.actionButton}
          />
        </View>

        {current.alternatives.length > 0 && (
          <View style={styles.alternatives}>
            <Text style={[typography.caption, styles.alternativesTitle]}>
              Other options ({current.alternatives.length})
            </Text>
            {current.alternatives.map((alternative) => (
              <TouchableOpacity
                key={alternative.candidate.id}
                accessibilityRole="button"
                accessibilityLabel={`Use ${describeCandidate(alternative.candidate)} instead`}
                style={[
                  styles.alternativeCard,
                  alternative.candidate.id === chosen.candidate.id ? styles.chosenCard : null,
                ]}
                activeOpacity={0.7}
                onPress={() => setChosen(alternative)}
              >
                <Text style={styles.alternativeTitle}>
                  {describeCandidate(alternative.candidate)}
                </Text>
                <Text style={styles.alternativeMeta}>{describeMeta(alternative.candidate)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function describeCandidate(candidate: RescueCandidate): string {
  const parts: string[] = [];
  if (candidate.additions.length > 0) {
    parts.push(`Add ${candidate.additions.map((a) => a.name).join(' + ')}`);
  }
  for (const substitution of candidate.substitutions) {
    parts.push(`Swap ${substitution.original.name} for ${substitution.replacement.name}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Adjust how you prepare it';
}

function describeMeta(candidate: RescueCandidate): string {
  const effort =
    candidate.cookingSteps === 0 ? 'Low' : candidate.cookingSteps <= 2 ? 'Medium' : 'High';
  return `${candidate.estimatedTime} min · Extra effort: ${effort}`;
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
  mealLabel: {
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  rescueLine: {
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  why: {
    marginBottom: spacing.sm,
  },
  meta: {},
  actions: {
    gap: spacing.sm,
  },
  actionButton: {},
  alternatives: {
    marginTop: spacing.xl,
  },
  alternativesTitle: {
    marginBottom: spacing.sm,
  },
  alternativeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  chosenCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  alternativeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  alternativeMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  savedTitle: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  savedText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
});
