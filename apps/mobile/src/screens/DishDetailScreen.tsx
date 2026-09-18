import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Pressable } from '../components/motion/Pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { FadeInView } from '../components/motion/FadeInView';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { getMealInstructions } from '../services/meal-memory.api';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface DishDetailParams {
  eventId: string;
  concept: string;
  mealSlot: string;
  dateKey: string;
  timeMinutes?: number;
  effort?: 'low' | 'medium' | 'high';
  cookingInstructions?: string[];
  ingredients?: string[];
  tips?: string[];
}

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'DishDetail'>;
type ScreenRouteProp = RouteProp<HomeStackParamList, 'DishDetail'>;

const EFFORT_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Easy', color: colors.softGreen },
  medium: { label: 'Medium', color: colors.softWarm },
  high: { label: 'Advanced', color: colors.softRed },
};

const H_PAD = 24;

export function DishDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const params = route.params as DishDetailParams;

  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [loadingInstructions, setLoadingInstructions] = useState(true);
  const [instructions, setInstructions] = useState<{
    cookingInstructions: string[];
    ingredients: string[];
    tips: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getMealInstructions(
          params.eventId,
          params.concept,
          params.ingredients,
          params.mealSlot,
        );
        if (!cancelled) setInstructions(result);
      } catch {
        // Failed to load instructions — show empty state
      } finally {
        if (!cancelled) setLoadingInstructions(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [params.eventId, params.concept]);

  const resolvedIngredients = instructions?.ingredients ?? params.ingredients;
  const resolvedInstructions = instructions?.cookingInstructions ?? params.cookingInstructions;
  const resolvedTips = instructions?.tips ?? params.tips;
  const hasIngredients = resolvedIngredients && resolvedIngredients.length > 0;
  const hasInstructions = resolvedInstructions && resolvedInstructions.length > 0;
  const hasTips = resolvedTips && resolvedTips.length > 0;
  const effortInfo = params.effort ? EFFORT_CONFIG[params.effort] : null;

  function toggleStep(index: number) {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleCookedIt() {
    navigation.goBack();
  }

  function handleSkip() {
    navigation.goBack();
  }

  return (
    <SafeAreaView style={sStyles.container} edges={['top']}>
      <FadeInView style={sStyles.container}>
        <View style={sStyles.header}>
          <Pressable
            style={sStyles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={22} color={colors.mealPlanInk} />
          </Pressable>
          <Text style={sStyles.headerTitle}>Dish Detail</Text>
          <View style={sStyles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={sStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={sStyles.heroCard}>
            <Text style={sStyles.dishName}>{params.concept}</Text>
            <View style={sStyles.metaRow}>
              {params.timeMinutes != null && (
                <View style={sStyles.metaItem}>
                  <Ionicons name="time-outline" size={16} color={colors.mealPlanSecondary} />
                  <Text style={sStyles.metaText}>{params.timeMinutes} min</Text>
                </View>
              )}
              {effortInfo && (
                <View style={[sStyles.effortBadge, { backgroundColor: effortInfo.color + '18' }]}>
                  <Text style={[sStyles.effortText, { color: effortInfo.color }]}>
                    {effortInfo.label}
                  </Text>
                </View>
              )}
            </View>
            <View style={sStyles.slotRow}>
              <Text style={sStyles.slotText}>{params.mealSlot}</Text>
              <Text style={sStyles.dateText}>{params.dateKey}</Text>
            </View>
          </View>

          {hasIngredients && (
            <FadeInView delay={80} rise={6}>
              <Text style={sStyles.sectionTitle}>Ingredients</Text>
              <View style={sStyles.card}>
                {resolvedIngredients!.map((item, idx) => (
                  <View
                    key={`ing-${idx}`}
                    style={[sStyles.ingredientRow, idx < resolvedIngredients!.length - 1 && sStyles.ingredientDivider]}
                  >
                    <Ionicons name="ellipse" size={6} color={colors.mealPlanSecondary} />
                    <Text style={sStyles.ingredientText}>{item}</Text>
                  </View>
                ))}
              </View>
            </FadeInView>
          )}

          <FadeInView delay={160} rise={6}>
            <Text style={sStyles.sectionTitle}>Cooking Steps</Text>
            {loadingInstructions ? (
              <View style={sStyles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={sStyles.loadingText}>Generating cooking instructions...</Text>
              </View>
            ) : hasInstructions ? (
              <View style={sStyles.card}>
                {resolvedInstructions!.map((step, idx) => {
                  const isCompleted = completedSteps.has(idx);
                  return (
                    <Pressable
                      key={`step-${idx}`}
                      style={[sStyles.stepRow, idx < resolvedInstructions!.length - 1 && sStyles.stepDivider]}
                      onPress={() => toggleStep(idx)}
                    >
                      <View style={[sStyles.stepCircle, isCompleted && sStyles.stepCircleCompleted]}>
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={14} color={colors.surface} />
                        ) : (
                          <Text style={sStyles.stepNumber}>{idx + 1}</Text>
                        )}
                      </View>
                      <Text
                        style={[sStyles.stepText, isCompleted && sStyles.stepTextCompleted]}
                      >
                        {step}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={sStyles.emptyCard}>
                <Ionicons name="book-outline" size={32} color={colors.mealPlanSecondary} />
                <Text style={sStyles.emptyText}>
                  No cooking instructions available for this dish yet.
                </Text>
              </View>
            )}
          </FadeInView>

          {hasTips && (
            <FadeInView delay={240} rise={6}>
              <Text style={sStyles.sectionTitle}>Tips</Text>
              <View style={sStyles.card}>
                {resolvedTips!.map((tip, idx) => (
                  <View
                    key={`tip-${idx}`}
                    style={[sStyles.tipRow, idx < resolvedTips!.length - 1 && sStyles.tipDivider]}
                  >
                    <Ionicons name="bulb-outline" size={16} color={colors.softWarm} />
                    <Text style={sStyles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            </FadeInView>
          )}

          <View style={sStyles.actions}>
            <PrimaryButton
              label="Cooked it"
              onPress={handleCookedIt}
              variant="primary"
            />
            <View style={{ height: spacing.sm }} />
            <PrimaryButton
              label="Skip"
              onPress={handleSkip}
              variant="secondary"
            />
          </View>

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      </FadeInView>
    </SafeAreaView>
  );
}

const sStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.mealPlanBackground,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '400',
    color: colors.mealPlanInk,
    textAlign: 'center',
    lineHeight: 25,
  },
  headerSpacer: {
    width: 34,
  },

  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingBottom: spacing.xl,
  },

  heroCard: {
    backgroundColor: colors.mealPlanSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  dishName: {
    ...typography.mealPlanTitle,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    ...typography.mealPlanCaption,
  },
  effortBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  effortText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    fontWeight: '500',
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mealPlanDivider,
  },
  slotText: {
    ...typography.mealPlanSection,
  },
  dateText: {
    ...typography.mealPlanCaption,
  },

  sectionTitle: {
    ...typography.mealPlanSection,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },

  card: {
    backgroundColor: colors.mealPlanSurface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },

  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  ingredientDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.mealPlanDivider,
  },
  ingredientText: {
    ...typography.mealPlanBody,
    flex: 1,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.mealPlanDivider,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.mealPlanSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepCircleCompleted: {
    backgroundColor: colors.softGreen,
    borderColor: colors.softGreen,
  },
  stepNumber: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.mealPlanSecondary,
  },
  stepText: {
    ...typography.mealPlanBody,
    flex: 1,
    lineHeight: 22,
  },
  stepTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.mealPlanSecondary,
  },

  emptyCard: {
    backgroundColor: colors.mealPlanSurface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  emptyText: {
    ...typography.mealPlanBody,
    color: colors.mealPlanSecondary,
    textAlign: 'center',
  },

  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  tipDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.mealPlanDivider,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
  },
  tipText: {
    ...typography.mealPlanBody,
    flex: 1,
    lineHeight: 22,
  },

  actions: {
    marginTop: spacing.md,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.mealPlanBody,
    color: colors.textSecondary,
  },
});
