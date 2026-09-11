import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { CravingProfile } from '@meal-rescue/shared-types';

import { PrimaryButton } from '../components/PrimaryButton';
import { StepShell } from '../components/decision/StepShell';
import { cravingEmpowermentLine, generateCravingChips } from '../components/decision/copy';
import { useDayPhase } from '../hooks/useDayPhase';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { useDecisionStore } from '../stores/decision.store';
import { colors, spacing } from '../theme';

/**
 * CRAVING LOCK (plan §5): optional one-tap capture of what to keep safe.
 * Framed as a guardrail, not an input tax: "what are you craving - we'll
 * keep it safe". Skippable with a single tap.
 */
export function CravingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Craving'>>();
  const { mealId, foods } = route.params;
  const setCraving = useDecisionStore((state) => state.setCraving);
  const clearCraving = useDecisionStore((state) => state.clearCraving);
  const { phase } = useDayPhase();
  const [text, setText] = useState('');
  const [chips, setChips] = useState<string[]>([]);

  // Generate dynamic chips based on detected food and time of day.
  const cravingChips = React.useMemo(() => generateCravingChips(foods, phase), [foods, phase]);

  const hasAnything = text.trim().length > 0 || chips.length > 0;

  function toggleChip(chip: string) {
    haptics.light();
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  function navigateToResult() {
    if (hasAnything) {
      const primary = text.trim() || chips[0] || 'the main thing you’re after';
      const craving: CravingProfile = {
        primary,
        preservedElements: [...chips],
        flexibleElements: [],
      };
      if (text.trim()) craving.preservedElements.push(text.trim());
      setCraving(craving);
    } else {
      clearCraving();
    }
    navigation.navigate('RescueLoading', { mealId, foods });
  }

  return (
    <StepShell step="3" title="What are you craving?" subtitle={cravingEmpowermentLine()}>
      <View style={styles.chipWrap}>
        {cravingChips.map((chip) => {
          const selected = chips.includes(chip);
          return (
            <TouchableOpacity
              key={chip}
              accessibilityRole="button"
              accessibilityLabel={chip}
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? styles.chipSelected : null]}
              activeOpacity={0.7}
              onPress={() => toggleChip(chip)}
            >
              <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="What are you craving"
        style={styles.input}
        placeholder={
          foods[0]
            ? `Or type it — e.g. "keep the ${foods[0].split(' ')[0]}"`
            : "Or type what you're after"
        }
        placeholderTextColor={colors.textSecondary}
        value={text}
        onChangeText={setText}
        maxLength={80}
      />

      <PrimaryButton
        label={hasAnything ? 'Lock it in — find my move' : 'No craving — find my move'}
        onPress={navigateToResult}
        style={styles.primary}
      />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Skip craving"
        style={styles.skip}
        activeOpacity={0.7}
        onPress={() => {
          clearCraving();
          navigation.navigate('RescueLoading', { mealId, foods });
        }}
      >
        <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
        <Text style={styles.skipText}>No craving — just show me the best move</Text>
      </TouchableOpacity>
    </StepShell>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipLabel: {
    fontSize: 14,
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: 56,
    marginBottom: spacing.xl,
  },
  primary: {
    marginBottom: spacing.sm,
  },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
