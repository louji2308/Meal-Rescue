import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../components/AppText';

import type { CommonTableResult } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../../components/ErrorBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import { getSharedMeal, splitReached, startCooking } from '../../services/common-table.api';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

/**
 * Plan & Cook — step 2 of the Common Table flow. Starts as the plan preview
 * (what we're making, the shared base, each person's finish), then lives on
 * through cooking: shared steps → split point → branch steps + finishes →
 * "Everyone's served", which hands off to step 3 (How Did It Go?).
 */
export function PlanCookScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const route = useRoute<RouteProp<CommonTableStackParamList, 'PlanCook'>>();
  const result = useCommonTableStore((s) => s.result);
  const setResult = useCommonTableStore((s) => s.setResult);
  const setActiveSheet = useCommonTableStore((s) => s.setActiveSheet);

  const sharedMealId = route.params?.sharedMealId ?? result?.sharedMealId;
  const [meal, setMeal] = useState<CommonTableResult | null>(result);
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const POLL_INTERVAL = 3000;

    if (!sharedMealId) return;
    setBusy(true);
    setError(null);

    async function fetchMeal() {
      try {
        const fetched = await getSharedMeal(sharedMealId!);
        if (cancelled) return;
        if (fetched.converged && fetched.plan) {
          setMeal(fetched);
          setResult(fetched);
          setBusy(false);
          return;
        }
        attempts++;
        if (attempts < MAX_ATTEMPTS) {
          setTimeout(() => { void fetchMeal(); }, POLL_INTERVAL);
        } else {
          setMeal(fetched);
          setResult(fetched);
          setBusy(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toApiError(err));
          setBusy(false);
        }
      }
    }

    void fetchMeal();
    return () => {
      cancelled = true;
    };
  }, [sharedMealId, setResult]);

  async function handleStartCooking() {
    if (!meal) return;
    setActing(true);
    setError(null);
    try {
      const started = await startCooking(meal.sharedMealId);
      setMeal(started);
      setResult(started);
      setActiveSheet(started.sharedMealId, started.status);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleSplit() {
    if (!meal) return;
    setActing(true);
    setError(null);
    try {
      const split = await splitReached(meal.sharedMealId);
      setMeal(split);
      setResult(split);
      setActiveSheet(split.sharedMealId, split.status);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setActing(false);
    }
  }

  function goToWrapUp() {
    if (!meal) return;
    navigation.navigate('HowDidItGo', { sharedMealId: meal.sharedMealId });
  }

  if (busy && !meal) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Finding the right meal for your table…</Text>
      </View>
    );
  }

  if (busy && meal && (!meal.converged || !meal.plan)) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Almost there — the AI is still thinking…</Text>
      </View>
    );
  }

  if (!meal?.converged || !meal.plan) {
    return (
      <View style={styles.loadingCenter}>
        <Text style={styles.loadingText}>This meal couldn't be loaded. Please try again.</Text>
      </View>
    );
  }

  const { plan } = meal;
  const hasBranches = plan.branchSteps.length > 0 && plan.finishes.length > 0;
  const atSplit = meal.status === 'split';
  const cooking = meal.status === 'cooking' || atSplit;

  if (!cooking) {
    // --- Step 2a: the plan preview --------------------------------------
return (
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInView>
        <ErrorBanner error={error} />

        {meal.blockedIngredients.length > 0 && (
          <View style={styles.safetyCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.softAlert} />
            <Text style={styles.safetyText}>
              Kept out for safety: {meal.blockedIngredients.join(', ')}
            </Text>
          </View>
        )}

        <Text style={styles.mealName}>{plan.baseName}</Text>
        <Text style={styles.mealDesc}>{plan.baseDescription}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.softAlert} />
            <Text style={styles.metaText}>~{plan.estimatedMinutes} min</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="flame-outline" size={16} color={colors.softAlert} />
            <Text style={styles.metaText}>{plan.effort}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Shared base</Text>
        <View style={styles.chips}>
          {plan.ingredients.map((ing) => (
            <View key={ing} style={styles.chip}>
              <Text style={styles.chipText}>{ing}</Text>
            </View>
          ))}
        </View>

        {plan.sharedSteps.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Shared steps</Text>
            {plan.sharedSteps.slice(0, plan.splitPointIndex).map((step, i) => (
              <View key={`shared-${i}`} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
                </View>
              </View>
            ))}
          </>
        )}

        {plan.finishes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Each person's finish</Text>
            {plan.finishes.map((finish) => (
              <View key={finish.id} style={styles.finishRow}>
                <View style={styles.finishAvatar}>
                  <Text style={styles.finishAvatarText}>{finish.memberName.charAt(0)}</Text>
                </View>
                <View style={styles.finishBody}>
                  <Text style={styles.finishTitle}>{finish.title}</Text>
                  {finish.additions.length > 0 && (
                    <Text style={styles.finishAdditions}>{finish.additions.join(', ')}</Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

<PrimaryButton
          label="Start cooking"
          onPress={() => void handleStartCooking()}
          busy={acting}
          style={styles.actionButton}
        />
        </FadeInView>
      </ScrollView>
    );
  }

// --- Step 2b: cooking ------------------------------------------------
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <FadeInView>
      <ErrorBanner error={error} />

      <Text style={styles.mealName}>{plan.baseName}</Text>
      <Text style={styles.status}>
        {atSplit
          ? 'Split point reached — everyone finishes their own plate now.'
          : 'Start with the shared base, then we finish each plate.'}
      </Text>

      {atSplit ? (
        <>
          <Text style={styles.sectionTitle}>Branch steps (from here)</Text>
          {plan.branchSteps.map((step, i) => (
            <View key={`branch-${i}`} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
              </View>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Each person's finish</Text>
          {plan.finishes.map((finish) => (
            <View key={finish.id} style={styles.finishRow}>
              <View style={styles.finishAvatar}>
                <Text style={styles.finishAvatarText}>{finish.memberName.charAt(0)}</Text>
              </View>
              <View style={styles.finishBody}>
                <Text style={styles.finishTitle}>{finish.title}</Text>
                {finish.additions.length > 0 && (
                  <Text style={styles.finishAdditions}>{finish.additions.join(', ')}</Text>
                )}
              </View>
            </View>
          ))}

          <PrimaryButton label="Everyone's served — how did it go?" onPress={goToWrapUp} style={styles.actionButton} />
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Shared base</Text>
          {plan.sharedSteps.slice(0, plan.splitPointIndex).map((step, i) => (
            <View key={`shared-${i}`} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
              </View>
            </View>
          ))}

{hasBranches ? (
            <PrimaryButton
              label="We've reached the split point"
              onPress={() => void handleSplit()}
              busy={acting}
              style={styles.actionButton}
            />
          ) : (
            <PrimaryButton label="Everyone's served — how did it go?" onPress={goToWrapUp} style={styles.actionButton} />
          )}
        </>
      )}
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success + '14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.success + '44',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  safetyText: {
    flex: 1,
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  mealName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'capitalize',
  },
  mealDesc: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    color: colors.text,
    textTransform: 'capitalize',
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  stepDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  finishRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  finishAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  finishBody: {
    flex: 1,
  },
  finishTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  finishAdditions: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  status: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  actionButton: {
    marginTop: spacing.xl,
  },
});
