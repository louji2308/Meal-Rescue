import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  DecisionAction,
  RescueCandidate,
  RescueGenerateResponse,
  UserDecision,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { LivingPlateSlot, SatisfactionCheckinSlot } from '../components/aftercare/slots';
import { BestMoveCard } from '../components/decision/BestMoveCard';
import { ReversibilityEditor } from '../components/decision/ReversibilityEditor';
import { actionLine, costLine } from '../components/decision/copy';
import { useDayPhase } from '../hooks/useDayPhase';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { getAdEligibility } from '../services/ads.api';
import { ApiError } from '../services/api';
import { commitDecisionSafe } from '../services/decision.api';
import { colors, spacing } from '../theme';

/**
 * RESCUE RESULT (V2 redesign, plan §9 / §13 / §35).
 *
 * Hero = ONE best move (BestMoveCard). Below: "or switch it up" alternatives,
 * then in-place reversibility editing. KEEP_AS_IS renders a "You're done" card.
 * Finally the aftercare slots (Living Plate + Satisfaction Check-in) so the
 * feedback loop continues without another screen hop.
 */
export function RescueResultScreen({
  route,
}: {
  route: { params: { result: RescueGenerateResponse; rescueId?: string } };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { phase, tint } = useDayPhase();
  const background = phase === 'night' ? colors.background : tint;
  const initial: RescueGenerateResponse = route.params.result;
  const rescueId = route.params.rescueId ?? initial.rescueId;

  const [chosen, setChosen] = useState(initial.recommendation);
  const [additions, setAdditions] = useState<string[]>(
    chosen.candidate.additions.map((a) => a.name),
  );
  const [isPro, setIsPro] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<ApiError | null>(null);

  useEffect(() => {
    getAdEligibility()
      .then((eligibility) => setIsPro(eligibility.tier === 'pro'))
      .catch(() => setIsPro(false));
  }, []);

  const action: DecisionAction | undefined = initial.decision ?? chosen.candidate.actionType;
  const foods = initial.originalMeal.foods;

  // Editable "working" candidate copy so reversibility updates the hero live.
  const working: RescueCandidate = useMemo(
    () => ({
      ...chosen.candidate,
      additions: additions.map((name) => ({ name })),
    }),
    [chosen, additions],
  );

  function handleReplace(index: number, replacement: string) {
    setAdditions((prev) => prev.map((name, i) => (i === index ? replacement : name)));
  }

  function handleRemove(index: number) {
    setAdditions((prev) => prev.filter((_, i) => i !== index));
  }

  /** The user's actual choice: swapped to an alternative, kept as-is, or did the move. */
  function decisionForChoice(): UserDecision {
    const choseAlternative = chosen.candidate.id !== initial.recommendation.candidate.id;
    if (choseAlternative) return 'swapped';
    if (action === 'KEEP_AS_IS') return 'kept_as_is';
    return 'accepted';
  }

  /**
   * The feedback route (and the meal_completed aftercare gate) require the
   * rescue to be DECIDED first - commit the user's action, then navigate.
   */
  async function commitThenNavigate(userDecision: UserDecision) {
    if (committing) return;
    setCommitting(true);
    setCommitError(null);
    const outcome = await commitDecisionSafe(rescueId, userDecision);
    if (outcome.ok) {
      const workingLabel = actionLine(action, additions);
      navigation.navigate('Feedback', { rescueId, recommendation: workingLabel });
    } else {
      setCommitError(outcome.error);
    }
    setCommitting(false);
  }

  function handleDoThis() {
    // Existing rescue completion endpoint (feedback) loop - no lock-in.
    void commitThenNavigate(decisionForChoice());
  }

  function handleKeepAsIs() {
    void commitThenNavigate('kept_as_is');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BestMoveCard
          action={action}
          candidate={working}
          foods={foods}
          isPro={isPro}
          onDoThis={handleDoThis}
          busy={committing}
          onKeepAsIs={handleKeepAsIs}
        />

        <ErrorBanner error={commitError} />

        <ReversibilityEditor
          additions={additions}
          onReplace={handleReplace}
          onRemove={handleRemove}
        />

        {initial.alternatives.length > 0 && (
          <View style={styles.alternatives}>
            <Text style={styles.alternativesTitle}>Or switch it up</Text>
            {initial.alternatives.slice(0, showMore ? undefined : 3).map((alternative) => {
              const isActive = alternative.candidate.id === chosen.candidate.id;
              return (
                <TouchableOpacity
                  key={alternative.candidate.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${alternative.candidate.additions
                    .map((a) => a.name)
                    .join(' + ')} instead`}
                  style={[styles.altCard, isActive ? styles.altCardActive : null]}
                  activeOpacity={0.7}
                  onPress={() => {
                    const next = alternative;
                    setChosen(next);
                    setAdditions(next.candidate.additions.map((a) => a.name));
                  }}
                >
                  <Text style={styles.altTitle}>
                    {actionLine(
                      alternative.candidate.actionType,
                      alternative.candidate.additions.map((a) => a.name),
                    )}
                  </Text>
                  <Text style={styles.altMeta}>
                    {costLine(
                      alternative.candidate.estimatedMinutes,
                      alternative.candidate.estimatedCostLevel,
                    )}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {initial.alternatives.length > 3 && !showMore && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setShowMore(true)}
                style={styles.more}
              >
                <Text style={styles.moreText}>Show a few more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.aftercare}>
          <LivingPlateSlot result={initial} />
          <SatisfactionCheckinSlot
            rescueId={rescueId}
            recommendation={actionLine(action, additions)}
          />
        </View>
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
    paddingBottom: spacing.xl,
  },
  alternatives: {
    marginTop: spacing.lg,
  },
  alternativesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  altCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  altCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  altTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  altMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  more: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  moreText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  aftercare: {
    marginTop: spacing.xl,
  },
});
