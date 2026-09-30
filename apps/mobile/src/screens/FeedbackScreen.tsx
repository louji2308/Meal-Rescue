import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FeedbackRequest } from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { ConfettiBurst } from '../components/effects/ConfettiBurst';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { submitFeedback } from '../services/feedback.api';
import { haptics } from '../services/haptics';
import { useRescuesStore } from '../stores/rescues.store';
import { colors, fonts, spacing, typography } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedOption({
  opt,
  isSelected,
  onSelect,
}: {
  opt: { value: string; emoji: string; label: string };
  isSelected: boolean;
  onSelect: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (isSelected) {
      scale.value = withSpring(1.1, { damping: 8, stiffness: 300 });
    } else {
      scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    }
  }, [isSelected]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={opt.label}
      accessibilityState={{ selected: isSelected }}
      style={[styles.option, isSelected && styles.optionSelected, animatedStyle]}
      onPress={onSelect}
    >
      <Text style={styles.emoji}>{opt.emoji}</Text>
      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
        {opt.label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Post-rescue feedback prompt. One simple question:
 * "How did that work for you?" with three emoji options
 * plus optional free text.
 */
export function FeedbackScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Feedback'>>();
  const { rescueId, recommendation, journalContext } = route.params;

  const [satisfaction, setSatisfaction] = useState<FeedbackRequest['satisfaction'] | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [journalNote, setJournalNote] = useState<{ title: string; body: string } | null>(null);

  const options: Array<{
    value: FeedbackRequest['satisfaction'];
    emoji: string;
    label: string;
  }> = [
    { value: 'better', emoji: '😊', label: 'Better' },
    { value: 'same', emoji: '😐', label: 'About the same' },
    { value: 'not_for_me', emoji: '😕', label: 'Not for me' },
  ];

  async function handleSubmit() {
    if (!satisfaction) return;

    setError(null);
    setBusy(true);
    try {
      const response = await submitFeedback(rescueId, {
        satisfaction,
        feedbackText: feedbackText.trim() || undefined,
        outcome: { completed: true },
        ...(journalContext ? { journalContext } : {}),
      });

      const note: { title: string; body: string } | null = response.journalNote
        ? { title: response.journalNote.title, body: response.journalNote.body }
        : null;
      setJournalNote(note);

      // "Better" is the love signal — remember this rescue so the paywall can
      // greet Profile → Upgrade with copy about the rescue they actually loved.
      if (satisfaction === 'better') {
        useRescuesStore.getState().markLoved(rescueId, recommendation);
      }

      haptics.success();
      setSubmitted(true);
      setConfettiTrigger((t) => t + 1);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (submitted) {
      // Give the note a beat to be read before returning home.
      const timer = setTimeout(
        () => {
          navigation.popToTop();
        },
        journalNote ? 4000 : 1200,
      );
      return () => clearTimeout(timer);
    }
  }, [submitted, navigation, journalNote]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {submitted ? (
          <View style={styles.successContainer}>
            <ConfettiBurst trigger={confettiTrigger} />
            <FadeInView>
              <Ionicons
                name="checkmark-circle"
                size={80}
                color={colors.primary}
                style={styles.successIcon}
              />
              <Text style={styles.successText}>Thanks!</Text>
              {journalNote ? (
                <View style={styles.noteCard}>
                  <Text style={styles.noteEyebrow}>Now in your Taste Journal</Text>
                  <Text style={styles.noteTitle}>{journalNote.title}</Text>
                  <Text style={styles.noteBody}>{journalNote.body}</Text>
                </View>
              ) : null}
            </FadeInView>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <FadeInView>
              <Text style={[typography.title, styles.title]}>How did that work for you?</Text>
              <Text style={[typography.body, styles.subtitle]}>
                Your feedback helps Meal Rescue learn what works for you.
              </Text>

              <View style={styles.options}>
                {options.map((opt) => (
                  <AnimatedOption
                    key={opt.value}
                    opt={opt}
                    isSelected={satisfaction === opt.value}
                    onSelect={() => {
                      haptics.light();
                      setSatisfaction(opt.value);
                    }}
                  />
                ))}
              </View>

              {satisfaction && (
                <View style={styles.textInputWrapper}>
                  <TextInput
                    accessibilityLabel="Optional feedback"
                    style={styles.textInput}
                    placeholder="What made it better / worse? (optional)"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                    maxLength={500}
                  />
                </View>
              )}

              <ErrorBanner error={error} />

              <PrimaryButton
                label="Submit"
                onPress={() => void handleSubmit()}
                busy={busy}
                disabled={!satisfaction}
                style={styles.submit}
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.popToTop()}
                style={styles.skip}
              >
                <Text style={styles.skipText}>Skip for now</Text>
              </Pressable>
            </FadeInView>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.homeTintNeutral,
  },
  emoji: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  optionLabelSelected: {
    color: colors.rescueAccent,
  },
  textInputWrapper: {
    marginBottom: spacing.lg,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submit: {
    marginBottom: spacing.md,
  },
  skip: {
    alignItems: 'center',
    padding: spacing.md,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    alignSelf: 'center',
  },
  successText: {
    marginTop: spacing.md,
    fontSize: 24,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
  },
  noteCard: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    width: 300,
  },
  noteEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  noteTitle: {
    fontFamily: fonts.serifDisplay,
    fontSize: 17,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  noteBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
