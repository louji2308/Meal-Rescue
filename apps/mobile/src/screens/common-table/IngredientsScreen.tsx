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
import { convergeMeal } from '../../services/common-table.api';
import { useCommonTableStore } from '../../stores/common-table.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

type Effort = 'quick' | 'normal';

const EFFORT_OPTIONS: { key: Effort; label: string; icon: string }[] = [
  { key: 'quick', label: 'Quick', icon: 'flash-outline' },
  { key: 'normal', label: 'Normal', icon: 'restaurant-outline' },
];

const TIME_OPTIONS = [
  { minutes: 15, label: '~15 min' },
  { minutes: 30, label: '~30 min' },
  { minutes: 45, label: '~45 min' },
  { minutes: 60, label: '~60 min' },
];

/**
 * Ingredients — what's in the house right now. We converge around these
 * (optionally pulling pantry from the Kitchen automatically).
 */
export function IngredientsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const route = useRoute<RouteProp<CommonTableStackParamList, 'Ingredients'>>();
  const memberIds = route.params?.memberIds ?? [];
  const members = useCommonTableStore((s) => s.members);
  const setResult = useCommonTableStore((s) => s.setResult);
  const setActiveSheet = useCommonTableStore((s) => s.setActiveSheet);

  const [ingredients, setIngredients] = useState('');
  const [usePantry, setUsePantry] = useState(true);
  const [effort, setEffort] = useState<Effort>('normal');
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const selectedNames = (memberIds: string[]) =>
    members.filter((m) => memberIds.includes(m.id)).map((m) => m.displayName);

  async function handleConverge() {
    if (memberIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const listed = ingredients
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await convergeMeal({
        memberIds,
        ingredients: listed.length > 0 || !usePantry ? listed : undefined,
        ingredientSource: usePantry ? 'kitchen' : 'text',
        effort,
        timeMinutes,
      });
      setResult(result);
      setActiveSheet(result.sharedMealId, result.status);
      navigation.navigate('PlanCook', { sharedMealId: result.sharedMealId });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <FadeInView>
      <ErrorBanner error={error} />

      <Text style={styles.intro}>
        What do we have to work with? List what's in the house, or let us pull your Kitchen pantry.
      </Text>

      {memberIds.length > 0 && (
        <Text style={styles.membersTag}>
          Cooking for {selectedNames(memberIds).join(', ')}
        </Text>
      )}

      <TextInput
        style={styles.ingredientInput}
        placeholder="eggs, rice, bell pepper, chicken, peanut-free sauce"
        placeholderTextColor={colors.textSecondary}
        value={ingredients}
        onChangeText={setIngredients}
        multiline
        autoCapitalize="none"
      />

      <View style={styles.section}>
        <Text style={styles.label}>Include my Kitchen pantry?</Text>
        <Pressable
          style={styles.toggleRow}
          onPress={() => setUsePantry((v) => !v)}
        >
          <Text style={styles.toggleText}>
            {usePantry ? 'Yes — use what I have' : 'Only what I typed'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Effort</Text>
        <View style={styles.optionRow}>
          {EFFORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.option, effort === opt.key && styles.optionActive]}
              onPress={() => setEffort(opt.key)}
            >
              <Text style={[styles.optionText, effort === opt.key && styles.optionTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Time available</Text>
        <View style={styles.optionRow}>
          {TIME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.minutes}
              style={[styles.option, timeMinutes === opt.minutes && styles.optionActive]}
              onPress={() => setTimeMinutes(opt.minutes)}
            >
              <Text
                style={[styles.optionText, timeMinutes === opt.minutes && styles.optionTextActive]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <PrimaryButton
        label="Find our meal"
        onPress={() => void handleConverge()}
        busy={busy}
        disabled={memberIds.length === 0}
        style={styles.convergeButton}
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
  intro: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  membersTag: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
    marginBottom: spacing.md,
  },
  ingredientInput: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  toggleText: {
    fontSize: 14,
    color: colors.text,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  optionText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.text,
  },
  convergeButton: {
    marginTop: spacing.md,
  },
});