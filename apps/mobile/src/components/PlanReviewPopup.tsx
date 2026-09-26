import React, { useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { AiPlannerQuestion, PlanPreviewResponse } from '@meal-rescue/shared-types';

import type { ApiError } from '../services/api';
import { colors, spacing, typography } from '../theme';
import { spring } from '../theme/motion';
import { Text } from './AppText';
import { ErrorBanner } from './ErrorBanner';
import { PrimaryButton } from './PrimaryButton';
import { XIcon } from './icons';

interface PlanReviewPopupProps {
  visible: boolean;
  preview: PlanPreviewResponse | null;
  clarification: { message: string; questions: AiPlannerQuestion[] } | null;
  error?: ApiError | null;
  onAccept: () => void;
  onEdit: (edits: string) => void;
  onAnswer: (answer: string) => void;
  onUpgrade: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function PlanReviewPopup({
  visible,
  preview,
  clarification,
  error = null,
  onAccept,
  onEdit,
  onAnswer,
  onUpgrade,
  onCancel,
  busy = false,
}: PlanReviewPopupProps) {
  const scale = useSharedValue(0.8);
  const overlayOpacity = useSharedValue(0);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, spring.gentle);
      overlayOpacity.value = withTiming(0.5, { duration: 200 });
    } else {
      scale.value = withSpring(0.8, spring.gentle);
      overlayOpacity.value = withTiming(0, { duration: 150 });
      setEditText('');
    }
  }, [visible]);

  const handleSend = () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setEditText('');
    if (clarification) {
      onAnswer(trimmed);
    } else {
      onEdit(trimmed);
    }
  };

  const handleAnswerOption = (option: string) => {
    Keyboard.dismiss();
    onAnswer(option);
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

  const animatedOverlay = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const animatedCard = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const showingClarification = visible && clarification !== null;
  const showingPreview = visible && preview !== null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, animatedOverlay]}>
        <Animated.View style={[styles.cardContainer, animatedCard]}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {showingClarification ? 'One Quick Question' : 'Review Your Plan'}
            </Text>
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

          <ScrollView
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ErrorBanner error={error} />

            {showingClarification ? (
              <View style={styles.clarificationSection}>
                <Text style={styles.clarificationMessage}>{clarification.message}</Text>
                {clarification.questions.map((question, qIndex) => (
                  <View key={question.id ?? `q-${qIndex}`} style={styles.questionCard}>
                    <Text style={styles.questionText}>{question.question}</Text>
                    {question.options && question.options.length > 0 && (
                      <View style={styles.optionRow}>
                        {question.options.map((option) => (
                          <Pressable
                            key={option}
                            accessibilityRole="button"
                            accessibilityLabel={option}
                            onPress={() => handleAnswerOption(option)}
                            disabled={busy}
                            style={styles.optionChip}
                          >
                            <Text style={styles.optionChipText}>{option}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : null}

            {showingPreview && preview ? (
              <>
                <Text style={styles.message}>{preview.message}</Text>

                {preview.daysUsed > 0 && (
                  <View style={styles.daysCounter}>
                    <Text style={styles.daysCounterLabel}>Days used this month</Text>
                    <Text style={styles.daysCounterValue}>
                      {preview.daysUsed} of {preview.daysUsed + preview.daysRemaining}
                    </Text>
                  </View>
                )}

                <View style={styles.mealsSection}>
                  {preview.days.map((day) => (
                    <View key={day.dateKey} style={styles.dayCard}>
                      <Text style={styles.dayHeader}>
                        {new Date(day.dateKey).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      {day.meals.map((meal) => (
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
                </View>
              </>
            ) : null}

            <View style={styles.promptSection}>
              <Text style={styles.promptLabel}>
                {showingClarification ? 'Type your answer' : 'Ask to adjust the plan'}
              </Text>
              <View style={styles.promptRow}>
                <TextInput
                  style={styles.promptInput}
                  placeholder={
                    showingClarification ? 'Type your answer…' : 'e.g. add dinner for Friday'
                  }
                  placeholderTextColor={colors.textSecondary}
                  value={editText}
                  onChangeText={setEditText}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit
                  editable={!busy}
                />
                <PrimaryButton
                  label="Send"
                  onPress={handleSend}
                  variant="primary"
                  busy={busy}
                  disabled={busy || !editText.trim()}
                  style={styles.sendButton}
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              {showingClarification ? (
                <PrimaryButton
                  label="Cancel"
                  onPress={onCancel}
                  variant="secondary"
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : preview?.requiresPayment ? (
                <PrimaryButton
                  label="Upgrade to Pro"
                  onPress={handleAccept}
                  variant="primary"
                  busy={busy}
                  disabled={busy}
                  style={styles.actionButton}
                />
              ) : (
                <PrimaryButton
                  label="Accept Plan"
                  onPress={handleAccept}
                  variant="primary"
                  busy={busy}
                  disabled={busy || !preview}
                  style={styles.actionButton}
                />
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
    paddingHorizontal: spacing.lg,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
    backgroundColor: colors.surface,
    borderRadius: 24,
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
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  clarificationSection: {
    marginBottom: spacing.md,
  },
  clarificationMessage: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  questionCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  questionText: {
    ...typography.subhead,
    color: colors.mealPlanInk,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.mealPlanSage,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionChipText: {
    ...typography.callout,
    color: colors.mealPlanInk,
  },
  daysCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.mealPlanSage,
    borderRadius: 12,
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
    borderRadius: 12,
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
  promptSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  promptLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  promptInput: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'System',
    color: colors.textPrimary,
    minHeight: 44,
  },
  sendButton: {
    minWidth: 88,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionButton: {
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
