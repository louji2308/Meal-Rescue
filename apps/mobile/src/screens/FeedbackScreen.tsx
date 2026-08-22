import { useNavigation, useRoute } from '@react-navigation/native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FeedbackRequest } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { submitFeedback } from '../services/feedback.api';
import { colors, spacing, typography } from '../theme';

/**
 * Post-rescue feedback prompt. One simple question:
 * "How did that work for you?" with three emoji options
 * plus optional free text.
 */
export function FeedbackScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Feedback'>>();
  const { rescueId } = route.params;

  const [satisfaction, setSatisfaction] = useState<FeedbackRequest['satisfaction'] | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const options: Array<{ value: FeedbackRequest['satisfaction']; emoji: string; label: string }> = [
    { value: 'better', emoji: '😊', label: 'Better' },
    { value: 'same', emoji: '😐', label: 'About the same' },
    { value: 'not_for_me', emoji: '🙁', label: 'Not for me' },
  ];

  async function handleSubmit() {
    if (!satisfaction) return;

    setError(null);
    setBusy(true);
    try {
      await submitFeedback(rescueId, {
        satisfaction,
        feedbackText: feedbackText.trim() || undefined,
        outcome: { completed: true },
      });
      navigation.popToTop();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.title, styles.title]}>How did that work for you?</Text>
          <Text style={[typography.body, styles.subtitle]}>
            Your feedback helps Meal Rescue learn what works for you.
          </Text>

          <View style={styles.options}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: satisfaction === opt.value }}
                style={[styles.option, satisfaction === opt.value ? styles.optionSelected : null]}
                activeOpacity={0.8}
                onPress={() => setSatisfaction(opt.value)}
              >
                <Text style={[styles.emoji]}>{opt.emoji}</Text>
                <Text
                  style={[
                    styles.optionLabel,
                    satisfaction === opt.value && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
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

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.popToTop()}
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
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
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
    color: colors.primary,
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
});
