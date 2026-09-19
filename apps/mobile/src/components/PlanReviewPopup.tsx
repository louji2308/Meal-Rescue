import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View, TextInput, Keyboard, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { Pressable } from './motion/Pressable';
import { Text } from './AppText';
import { PrimaryButton } from './PrimaryButton';
import { XIcon } from './icons';

import type { PlanPreviewResponse } from '@meal-rescue/shared-types';

import { colors, fonts, radius, spacing, typography } from '../theme';
import { spring } from '../theme/motion';

interface PlanReviewPopupProps {
  visible: boolean;
  preview: PlanPreviewResponse | null;
  onAccept: () => void;
  onEdit: (edits: string) => void;
  onUpgrade: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function PlanReviewPopup({
  visible,
  preview,
  onAccept,
  onEdit,
  onUpgrade,
  onCancel,
  busy = false,
}: PlanReviewPopupProps) {
  const scale = useSharedValue(0.8);
  const overlayOpacity = useSharedValue(0);
  const isEditMode = useSharedValue(0);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, spring.gentle);
      overlayOpacity.value = withTiming(0.5, { duration: 200 });
    } else {
      scale.value = withSpring(0.8, spring.gentle);
      overlayOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      isEditMode.value = withSpring(0, spring.gentle);
      setEditText('');
    }
  }, [visible]);

  const handleEditPress = () => {
    isEditMode.value = withSpring(1, spring.gentle);
    runOnJS(() => Keyboard.dismiss())();
  };

  const handleApplyEdit = () => {
    if (editText.trim()) {
      isEditMode.value = withSpring(0, spring.gentle);
      runOnJS(() => Keyboard.dismiss())();
      onEdit(editText.trim());
      setEditText('');
    }
  };

  const handleAccept = () => {
    if (preview?.requiresPayment) {
      onUpgrade();
    } else {
      onAccept();
    }
  };

  const formatSlot = (slot: string) => {
    return slot.charAt(0).toUpperCase() + slot.slice(1);
  };

  if (!preview) return null;

  const animatedOverlay = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const editModeOpacity = useAnimatedStyle(() => ({
    opacity: isEditMode.value,
    height: isEditMode.value,
  }));

  const normalModeOpacity = useAnimatedStyle(() => ({
    opacity: withSpring(1 - isEditMode.value, spring.gentle),
    height: withSpring(1 - isEditMode.value, spring.gentle),
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, animatedOverlay]}>
        <Animated.View style={[styles.cardContainer, animatedCard]}>
          <ScrollView
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Review Your Plan</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onCancel}
                disabled={busy}
                style={styles.closeButton}
              >
                <XIcon size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.message}>{preview.message}</Text>

            {preview.daysUsed > 0 && (
              <View style={styles.daysCounter}>
                <Text style={styles.daysCounterLabel}>Days used this month</Text>
                <Text style={styles.daysCounterValue}>
                  {preview.daysUsed} of {preview.daysUsed + preview.daysRemaining}
                </Text>
              </View>
            )}

            <Animated.View style={[styles.mealsSection, normalModeOpacity]}>
              {preview.days.map((day, dayIndex) => (
                <View key={day.dateKey} style={styles.dayCard}>
                  <Text style={styles.dayHeader}>
                    {new Date(day.dateKey).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  {day.meals.map((meal, mealIndex) => (
                    <View key={meal.id} style={styles.mealRow}>
                      <View style={styles.mealSlot}>
                        <Text style={styles.mealSlotLabel}>{formatSlot(meal.mealSlot)}</Text>
                      </View>
<View style={styles.mealInfo}>
                         <Text style={styles.mealConcept}>{meal.name || meal.recipeName}</Text>
                         {meal.ingredients && meal.ingredients.length > 0 && (
                           <Text style={styles.mealReason}>
                             {meal.ingredients.slice(0, 3).join(', ')}
                             {meal.ingredients.length > 3 ? '...' : ''}
                           </Text>
                         )}
                       </View>
                    </View>
                  ))}
                </View>
              ))}
            </Animated.View>

            <Animated.View style={[styles.editSection, editModeOpacity]}>
              <Text style={styles.editLabel}>What would you like to change?</Text>
              <TextInput
                style={styles.editInput}
                placeholder="Tell me what to change..."
                placeholderTextColor={colors.textSecondary}
                multiline
                value={editText}
                onChangeText={setEditText}
                autoFocus
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <PrimaryButton
                label="Apply Changes"
                onPress={handleApplyEdit}
                variant="primary"
                busy={busy}
                disabled={busy || !editText.trim()}
              />
            </Animated.View>

            <View style={styles.buttonRow}>
              {preview.requiresPayment ? (
                <PrimaryButton
                  label="Upgrade to Pro"
                  onPress={handleAccept}
                  variant="primary"
                  busy={busy}
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : (
                <>
                  <PrimaryButton
                    label="Accept Plan"
                    onPress={handleAccept}
                    variant="primary"
                    busy={busy}
                    disabled={busy}
                    style={styles.actionButton}
                  />
                  <PrimaryButton
                    label="Edit"
                    onPress={handleEditPress}
                    variant="secondary"
                    disabled={busy}
                    style={styles.editButton}
                  />
                </>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              disabled={busy}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  cardContent: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
    minWidth: 40,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  daysCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.mealPlanSage,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  daysCounterLabel: {
    ...typography.caption,
    color: colors.mealPlanSageText,
  },
  daysCounterValue: {
    ...typography.subhead,
    color: colors.mealPlanSageText,
    fontWeight: '700',
  },
  mealsSection: {},
  dayCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dayHeader: {
    ...typography.mealPlanSection,
    color: colors.mealPlanInk,
    marginBottom: spacing.sm,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  mealSlot: {
    width: 70,
    flexShrink: 0,
  },
  mealSlotLabel: {
    ...typography.mealPlanCaption,
    color: colors.mealPlanSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  mealInfo: {
    flex: 1,
  },
  mealConcept: {
    ...typography.mealPlanMealName,
    color: colors.mealPlanInk,
  },
  mealReason: {
    ...typography.mealPlanCaption,
    color: colors.mealPlanSecondary,
    marginTop: spacing.xs,
  },
  editSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  editInput: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  editButton: {
    flex: 1,
  },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
});