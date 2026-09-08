import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { StepShell } from '../components/decision/StepShell';
import { BUDGET_OPTIONS, CLEANUP_OPTIONS, TIME_OPTIONS } from '../components/decision/copy';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { useDecisionStore } from '../stores/decision.store';
import { colors, spacing } from '../theme';

/**
 * REALITY STEP (plan §8 / §34): quick chips, NOT a settings form.
 * Defaults are already permissive, so most people just tap "Looks good".
 */
export function RealityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Reality'>>();
  const { intentLabel, mealId, foods } = route.params;
  const reality = useDecisionStore((state) => state.reality);
  const setTimeAvailable = useDecisionStore((state) => state.setTimeAvailable);
  const setBudget = useDecisionStore((state) => state.setBudget);
  const setReality = useDecisionStore((state) => state.setReality);

  return (
    <StepShell
      step="2"
      title="What’s realistic right now?"
      subtitle={`For “${intentLabel}” — skip anything that doesn’t matter.`}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Time</Text>
        <View style={styles.chipRow}>
          {TIME_OPTIONS.map((opt) => {
            const selected = reality.timeAvailable === opt.value;
            return (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={selected}
                onPress={() => setTimeAvailable(opt.value)}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Cooking</Text>
        <View style={styles.chipRow}>
          <Chip
            label="I can cook a bit"
            selected={reality.cookingAllowed}
            onPress={() => setReality({ cookingAllowed: true })}
          />
          <Chip
            label="No cooking"
            selected={!reality.cookingAllowed}
            onPress={() => setReality({ cookingAllowed: false })}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Budget</Text>
        <View style={styles.chipRow}>
          {BUDGET_OPTIONS.map((opt) => {
            const selected = reality.budgetLevel === opt.value;
            return (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={selected}
                onPress={() => setBudget(opt.value)}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Cleanup</Text>
        <View style={styles.chipRow}>
          {CLEANUP_OPTIONS.map((opt) => {
            const selected = reality.cleanupTolerance === opt.value;
            return (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={selected}
                onPress={() => setReality({ cleanupTolerance: opt.value })}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.hintRow}>
        <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
        <Text style={styles.hint}>
          All set to your easiest defaults — change nothing if you like.
        </Text>
      </View>

      <PrimaryButton
        label="Looks good — next"
        onPress={() => {
          haptics.light();
          navigation.navigate('Craving', { mealId, foods });
        }}
        style={styles.next}
      />
    </StepShell>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? styles.chipSelected : null]}
      activeOpacity={0.7}
      onPress={() => {
        haptics.light();
        onPress();
      }}
    >
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  hint: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  next: {
    marginTop: spacing.xs,
  },
});
