import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '../components/motion/Pressable';
import { Text } from '../components/AppText';

import { StepShell } from '../components/decision/StepShell';
import { INTENT_OPTIONS, intentCopy } from '../components/decision/copy';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { useDecisionStore } from '../stores/decision.store';
import { colors, spacing } from '../theme';

const INTENT_ICON_COLORS: Record<string, string> = {
  'sparkles-outline': colors.rescueAccent,
  'heart-outline': colors.rescueAccent,
  'leaf-outline': colors.rescueAccent,
  'help-circle-outline': colors.rescueAccent,
  'flash-outline': colors.rescueAccent,
};

/**
 * INTENT STEP (plan §4 / §34): "What do you want right now?"
 * Five plain-language, warm options. ONE tap -> straight to Reality.
 * We never show internal terms like SATISFY / DECIDE.
 */
export function IntentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Intent'>>();
const { analysis, editedMealText } = route.params;
  const setIntent = useDecisionStore((state) => state.setIntent);

  const mealId = analysis.mealId;
  const foods = analysis.detectedFoods.map((food) => food.name);
  const foodSummary = editedMealText && editedMealText.length > 0
    ? editedMealText
    : foods.length > 0
      ? foods.length === 1
        ? foods[0]
        : foods.slice(0, -1).join(', ') + ' and ' + foods[foods.length - 1]
      : 'your meal';

  return (
    <StepShell
      step="1"
      title="What do you want right now?"
      subtitle="No wrong answers — we build from here."
    >
      <View style={styles.foodBadge}>
        <Text style={styles.foodBadgeText}>{foodSummary}</Text>
      </View>

      <View style={styles.list}>
        {INTENT_OPTIONS.map((option) => (
          <Pressable
            key={option.intent}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            style={styles.row}
            onPress={() => {
              haptics.light();
              const meta = intentCopy(option.intent);
              setIntent(option.intent);
              navigation.navigate('Reality', {
                intentLabel: meta.label,
                mealId,
                foods,
              });
            }}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                // @ts-expect-error Ionicons glyph map is string-typed at runtime
                name={option.icon}
                size={22}
                color={INTENT_ICON_COLORS[option.icon] ?? colors.rescueAccent}
              />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.label}>{option.label}</Text>
              <Text style={styles.caption}>{option.caption}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.rescueAccent} />
          </Pressable>
        ))}
      </View>
    </StepShell>
  );
}

const styles = StyleSheet.create({
  foodBadge: {
    backgroundColor: colors.homeTintNeutral,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  foodBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.rescueAccent,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.homeTintNeutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  caption: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});

