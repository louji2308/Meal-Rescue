import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Image,
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

import type { FridgeNegotiateResponse, MealRecommendation } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import { negotiateFridge } from '../services/fridge.api';
import { colors, spacing, typography } from '../theme';

/**
 * Fridge Negotiator - "I'm hungry, here's what I have"
 * Input: ingredients + time + hunger level → up to 3 meal recommendations
 * Product rule: MAX 3 recommendations, never a list of 25 recipes
 */
export function FridgeNegotiatorScreen() {
  const [ingredientsText, setIngredientsText] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('15');
  const [hungerLevel, setHungerLevel] = useState<'snack' | 'meal'>('meal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [results, setResults] = useState<FridgeNegotiateResponse | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  function parseIngredients(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleCamera() {
    try {
      const { launchCameraAsync } = await import('expo-image-picker');
      const res = await launchCameraAsync({ quality: 0.8 });
      if (!res.canceled && res.assets?.[0]) {
        setPhotoUri(res.assets[0].uri);
      }
    } catch {
      // camera not available on emulator without camera
    }
  }

  async function handleLibrary() {
    const { launchImageLibraryAsync } = await import('expo-image-picker');
    const res = await launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  }

  async function handleSubmit() {
    const ingredients = parseIngredients(ingredientsText);
    if (ingredients.length === 0) return;

    setError(null);
    setBusy(true);
    try {
      const response = await negotiateFridge({
        availableIngredients: ingredients,
        timeMinutes: parseInt(timeMinutes, 10) || 15,
        hungerLevel,
      });
      setResults(response);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (results) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.heading, styles.title]}>Your meals</Text>
          <Text style={styles.reasoning}>{results.reasoning}</Text>

          {results.missingIngredients.length > 0 && (
            <View style={styles.missing}>
              <Text style={styles.missingLabel}>
                Missing: {results.missingIngredients.join(', ')}
              </Text>
            </View>
          )}

          <View style={styles.results}>
            {results.recommendations.map((meal: MealRecommendation, idx) => (
              <TouchableOpacity
                key={`${meal.name}-${idx}`}
                style={styles.mealCard}
                activeOpacity={0.8}
                onPress={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              >
                <Text style={styles.mealName}>{meal.name}</Text>
                <Text style={styles.mealMeta}>
                  {meal.estimatedTimeMinutes} min · {meal.effort} effort
                </Text>
                <Text style={styles.mealIngredients}>
                  {meal.ingredients.slice(0, 3).join(', ')}
                  {meal.ingredients.length > 3 ? '...' : ''}
                </Text>
                <Text style={styles.missingInline}>
                  Missing: {meal.missingIngredients.join(', ') || 'nothing'}
                </Text>
                {expandedIdx === idx && (
                  <View style={styles.detail}>
                    {meal.nutritionNote ? (
                      <Text style={styles.nutritionNote}>{meal.nutritionNote}</Text>
                    ) : null}
                    <Text style={styles.sectionLabel}>You need</Text>
                    {meal.ingredients.map((ing, i) => (
                      <Text key={`ing-${i}`} style={styles.listItem}>
                        • {ing}
                      </Text>
                    ))}
                    <Text style={styles.sectionLabel}>Steps</Text>
                    {meal.instructions.map((step, i) => (
                      <Text key={`step-${i}`} style={styles.listItem}>
                        {i + 1}. {step}
                      </Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setResults(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>New search</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[typography.heading, styles.title]}>Fridge Negotiator</Text>
          <Text style={[typography.body, styles.subtitle]}>
            What do you have? I'll suggest meals you can make.
          </Text>

          <ErrorBanner error={error} />

          <TextInput
            style={styles.textArea}
            placeholder="eggs, bread, banana, peanut butter"
            placeholderTextColor={colors.textSecondary}
            multiline
            value={ingredientsText}
            onChangeText={setIngredientsText}
          />

          {photoUri ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotoUri(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <TouchableOpacity
                style={styles.photoButton}
                activeOpacity={0.8}
                onPress={handleCamera}
              >
                <Ionicons name="camera" size={28} color={colors.primary} />
                <Text style={styles.photoButtonLabel}>Snap your fridge</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoButton}
                activeOpacity={0.8}
                onPress={handleLibrary}
              >
                <Ionicons name="images" size={28} color={colors.primary} />
                <Text style={styles.photoButtonLabel}>Choose a photo</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Time (minutes)</Text>
              <TextInput
                style={styles.input}
                value={timeMinutes}
                onChangeText={setTimeMinutes}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.field, styles.hungerField]}>
              <Text style={styles.fieldLabel}>Hunger</Text>
              <TouchableOpacity
                style={[styles.segment, hungerLevel === 'snack' && styles.segmentActive]}
                activeOpacity={0.8}
                onPress={() => setHungerLevel('snack')}
              >
                <Text
                  style={[styles.segmentText, hungerLevel === 'snack' && styles.segmentTextActive]}
                >
                  Snack
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, hungerLevel === 'meal' && styles.segmentActive]}
                activeOpacity={0.8}
                onPress={() => setHungerLevel('meal')}
              >
                <Text
                  style={[styles.segmentText, hungerLevel === 'meal' && styles.segmentTextActive]}
                >
                  Meal
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <PrimaryButton
            label="Find meals"
            onPress={() => void handleSubmit()}
            busy={busy}
            disabled={ingredientsText.trim().length === 0}
          />
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
  textArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  hungerField: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  segmentTextActive: {
    color: colors.surface,
  },
  reasoning: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
  },
  missing: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  missingLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  results: {
    gap: spacing.md,
  },
  mealCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  mealMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  mealIngredients: {
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  missingInline: {
    fontSize: 12,
    color: colors.secondary,
  },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nutritionNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  listItem: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  retryButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  photoButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  photoButtonLabel: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  photoWrap: {
    position: 'relative',
    marginBottom: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.text,
    borderRadius: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
