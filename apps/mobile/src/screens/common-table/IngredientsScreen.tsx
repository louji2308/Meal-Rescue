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
import { useSettingsStore } from '../../stores/settings.store';
import { colors, spacing } from '../../theme';
import { FadeInView } from '../../components/motion/FadeInView';

const TIME_OPTIONS = [
  { minutes: 15, label: '~15 min' },
  { minutes: 30, label: '~30 min' },
  { minutes: 45, label: '~45 min' },
  { minutes: 60, label: '~60 min' },
];

export function IngredientsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommonTableStackParamList>>();
  const route = useRoute<RouteProp<CommonTableStackParamList, 'Ingredients'>>();
  const memberIds = route.params?.memberIds ?? [];
  const members = useCommonTableStore((s) => s.members);
  const setResult = useCommonTableStore((s) => s.setResult);
  const setActiveSheet = useCommonTableStore((s) => s.setActiveSheet);
  const kitchenImportEnabled = useSettingsStore((s) => s.kitchenImportEnabled);

  const [ingredients, setIngredients] = useState('');
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [customTime, setCustomTime] = useState('');
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const selectedNames = (ids: string[]) =>
    members.filter((m) => ids.includes(m.id)).map((m) => m.displayName);

  const effectiveTime = showCustomTime ? parseInt(customTime, 10) || 30 : timeMinutes;

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
        ingredients: listed.length > 0 || !kitchenImportEnabled ? listed : undefined,
        ingredientSource: kitchenImportEnabled ? 'kitchen' : 'text',
        timeMinutes: effectiveTime,
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
          {kitchenImportEnabled
            ? "What's on hand? Type ingredients or we'll pull from your Kitchen pantry."
            : "What do we have to work with? List what's in the house."}
        </Text>

        {memberIds.length > 0 && (
          <Text style={styles.membersTag}>
            Cooking for {selectedNames(memberIds).join(', ')}
          </Text>
        )}

        <TextInput
          style={styles.ingredientInput}
          placeholder="List what you have, we'll plan the rest"
          placeholderTextColor={colors.textSecondary}
          value={ingredients}
          onChangeText={setIngredients}
          multiline
          autoCapitalize="none"
        />

        {kitchenImportEnabled && (
          <View style={styles.pantryBadge}>
            <Text style={styles.pantryBadgeText}>Kitchen pantry connected</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Time available</Text>
          <View style={styles.optionRow}>
            {TIME_OPTIONS.map((opt) => (
              <Pressable
                key={opt.minutes}
                style={[
                  styles.option,
                  !showCustomTime && timeMinutes === opt.minutes && styles.optionActive,
                ]}
                onPress={() => {
                  setTimeMinutes(opt.minutes);
                  setShowCustomTime(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    !showCustomTime && timeMinutes === opt.minutes && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.option, showCustomTime && styles.optionActive]}
              onPress={() => setShowCustomTime(true)}
            >
              <Text style={[styles.optionText, showCustomTime && styles.optionTextActive]}>
                + Custom
              </Text>
            </Pressable>
          </View>
          {showCustomTime && (
            <View style={styles.customTimeRow}>
              <TextInput
                style={styles.customTimeInput}
                placeholder="min"
                placeholderTextColor={colors.textSecondary}
                value={customTime}
                onChangeText={setCustomTime}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.customTimeUnit}>min</Text>
            </View>
          )}
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
  pantryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success + '15',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.lg,
  },
  pantryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
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
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  customTimeInput: {
    width: 64,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  customTimeUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  convergeButton: {
    marginTop: spacing.md,
  },
});
