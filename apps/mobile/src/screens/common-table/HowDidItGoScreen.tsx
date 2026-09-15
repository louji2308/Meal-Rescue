import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/motion/Pressable';

import { Text } from '../../components/AppText';
import { TextInput } from '../../components/AppTextInput';

import { ErrorBanner } from '../../components/ErrorBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CommonTableStackParamList } from '../../navigation/CommonTableNavigator';
import { toApiError } from '../../services/api';
import { completeMeal, submitMealFeedback } from '../../services/common-table.api';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

type PersonChoice = 'loved' | 'worked' | 'not_really' | 'skipped';

const PERSON_OPTIONS: { key: PersonChoice; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { key: 'loved', label: 'Loved it', icon: 'heart' },
    { key: 'worked', label: 'It worked', icon: 'hand-left-outline' },
    { key: 'not_really', label: 'Not really', icon: 'thumbs-down-outline' },
    { key: 'skipped', label: 'Skipped', icon: 'close-circle-outline' },
  ];

const OVERALL_OPTIONS: { key: 'loved' | 'worked' | 'not_really'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'loved', label: 'Loved it', icon: 'heart' },
  { key: 'worked', label: 'It worked', icon: 'hand-left-outline' },
  { key: 'not_really', label: 'Not really', icon: 'thumbs-down-outline' },
];

/**
 * How Did It Go? — step 3. One row per person (Loved it / It worked /
 * Not really / Skipped) plus an overall rating and an optional note. Saves
 * the finish ledger, then the taste feedback, then closes the loop.
 */
export function HowDidItGoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const route = useRoute<RouteProp<CommonTableStackParamList, 'HowDidItGo'>>();
  const result = useCommonTableStore((s) => s.result);
  const setActiveSheet = useCommonTableStore((s) => s.setActiveSheet);
  const reset = useCommonTableStore((s) => s.reset);

  const sharedMealId = route.params?.sharedMealId ?? result?.sharedMealId;
  const plan = result?.plan;

  const finishMembers = plan?.finishes ?? [];

  const [personChoices, setPersonChoices] = useState<Record<string, PersonChoice>>({});
  const [overall, setOverall] = useState<'loved' | 'worked' | 'not_really' | null>(null);
  const [remember, setRemember] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  if (!sharedMealId) {
    return (
      <View style={styles.loadingCenter}>
        <Text style={styles.loadingText}>No meal to review.</Text>
      </View>
    );
  }

  async function handleSaveAndLearn() {
    if (!sharedMealId || !overall) return;
    setBusy(true);
    setError(null);
    try {
      const finishResults =
        finishMembers.length > 0
          ? finishMembers.map((finish) => ({
              memberId: finish.memberId,
              status: personChoices[finish.memberId] === 'skipped' ? ('skipped' as const) : ('applied' as const),
            }))
          : undefined;
      await completeMeal(sharedMealId, { finishResults });
      const memberOutcomes = finishMembers
        .flatMap(
          (finish): { memberId: string; rating: 'loved' | 'worked' | 'not_really' }[] => {
            const choice = personChoices[finish.memberId];
            if (choice === undefined || choice === 'skipped') return [];
            if (choice === 'loved' || choice === 'worked' || choice === 'not_really') {
              return [{ memberId: finish.memberId, rating: choice }];
            }
            return [];
          },
        );
      await submitMealFeedback(sharedMealId, {
        householdRating: overall,
        remember: remember.trim() || undefined,
        memberOutcomes: memberOutcomes.length > 0 ? memberOutcomes : undefined,
      });
      setActiveSheet(null, null);
      setDone(true);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={styles.doneCenter}>
        <Ionicons name="checkmark-circle" size={56} color={colors.softAlert} />
        <Text style={styles.doneTitle}>Meal recorded!</Text>
        <Text style={styles.doneText}>
          We saved what worked so the next table planning starts smarter.
        </Text>
        <PrimaryButton
          label="Back to Common Table"
          onPress={() => {
            reset();
            navigation.popToTop();
          }}
          style={styles.doneButton}
        />
      </View>
    );
  }

return (
    <ScrollView contentContainerStyle={styles.content}>
      <FadeInView>
      <ErrorBanner error={error} />

      <Text style={styles.labelPremium}>How did the meal go overall?</Text>
      <View style={styles.ratingRow}>
        {OVERALL_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.ratingChip, overall === opt.key && styles.ratingChipActive]}
            onPress={() => setOverall(opt.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: overall === opt.key }}
          >
            <Ionicons
              name={opt.icon}
              size={20}
              color={overall === opt.key ? colors.surface : colors.textSecondary}
            />
            <Text style={[styles.ratingText, overall === opt.key && styles.ratingTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {finishMembers.length > 0 && (
        <>
          <Text style={styles.labelPremium}>How did each person do?</Text>
          <View style={styles.memberList}>
            {finishMembers.map((finish) => {
              const choice = personChoices[finish.memberId] ?? (finish.title ? 'worked' : undefined);
              return (
                <View key={finish.id} style={styles.memberCard}>
                  <View style={styles.memberHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{finish.memberName.charAt(0)}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{finish.memberName}</Text>
                      {finish.title ? (
                        <Text style={styles.memberFinish}>Finish: {finish.title}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.memberRatings}>
                    {PERSON_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        style={[styles.miniChip, choice === opt.key && styles.miniChipActive]}
                        onPress={() => {
                          if (choice === opt.key) {
                            const next: Record<string, PersonChoice> = { ...personChoices };
                            delete next[finish.memberId];
                            setPersonChoices(next);
                          } else {
                            setPersonChoices((r) => ({ ...r, [finish.memberId]: opt.key }));
                          }
                        }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: choice === opt.key }}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={15}
                          color={choice === opt.key ? colors.surface : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.miniChipText,
                            choice === opt.key && styles.miniChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.labelPremium}>Something to remember about this table? (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Maya loved the peanut sauce; Dad wanted less spice"
        placeholderTextColor={colors.textSecondary}
        value={remember}
        onChangeText={setRemember}
        multiline
      />

      <PrimaryButton
        label="Save and learn"
        onPress={() => void handleSaveAndLearn()}
        busy={busy}
        disabled={!overall}
style={styles.submitButton}
      />
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
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  doneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  doneText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  doneButton: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  labelPremium: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
ratingChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  ratingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
ratingTextActive: {
    color: colors.text,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textTransform: 'capitalize',
  },
  memberFinish: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  memberRatings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  miniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
miniChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  miniChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: colors.surface,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 88,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  submitButton: {
    marginTop: spacing.xl,
  },
});
