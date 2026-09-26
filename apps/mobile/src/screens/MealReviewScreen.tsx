import { Ionicons } from '@expo/vector-icons';
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecognizedItem } from '@meal-rescue/shared-types';

import { AppImage } from '../components/AppImage';
import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface EditableItem {
  id: number;
  name: string;
  itemType: RecognizedItem['itemType'];
}

/**
 * Meal photo review — shows the captured photo and identified food items.
 * Photo captures land here from CaptureScreen. The user can fix misidentified
 * names, add missing items, or remove wrong ones before continuing to rescue.
 */
export function MealReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'MealReview'>>();
  const { analysis, imageUri } = route.params;

  const [items, setItems] = useState<EditableItem[]>(() =>
    (analysis.items?.length ? analysis.items : deriveItems(analysis)).map((item, index) => ({
      id: index,
      name: item.name,
      itemType: item.itemType,
    })),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addInputVisible, setAddInputVisible] = useState(false);
  const [addInputValue, setAddInputValue] = useState('');
  const addInputRef = useRef<RNTextInput>(null);
  const nextId = useRef(items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 0);

  const updateName = useCallback((id: number, name: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
  }, []);

  const removeItem = useCallback((id: number) => {
    haptics.light();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addItem = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    haptics.light();
    setItems((prev) => [
      ...prev,
      { id: nextId.current++, name: trimmed, itemType: 'PREPARED_MEAL' as const },
    ]);
    setAddInputValue('');
  }, []);

  const submittedViaButton = useRef(false);

  const handleAddSubmit = useCallback(() => {
    submittedViaButton.current = true;
    addItem(addInputValue);
    setTimeout(() => {
      submittedViaButton.current = false;
    }, 300);
  }, [addInputValue, addItem]);

  const handleAddPress = useCallback(() => {
    setAddInputVisible(true);
    setTimeout(() => addInputRef.current?.focus(), 100);
  }, []);

  const handleContinue = useCallback(() => {
    const foods = items
      .filter((item) => item.itemType !== 'INGREDIENT')
      .map((item) => item.name.trim())
      .filter(Boolean);
    const ingredients = items
      .filter((item) => item.itemType === 'INGREDIENT')
      .map((item) => item.name.trim())
      .filter(Boolean);
    navigation.navigate('AiRescue', {
      foods: foods.length > 0 ? foods : [analysis.detectedFoods[0]?.name ?? 'meal'],
      ingredients,
      mealId: analysis.mealId,
    });
  }, [items, navigation, analysis]);

  const handleRetake = useCallback(() => {
    navigation.navigate('Capture');
  }, [navigation]);

  const keptCount = useMemo(() => items.filter((i) => i.name.trim()).length, [items]);
  const nothingRecognized = items.length === 0 || keptCount === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.homeInk} />
        </Pressable>
        <View style={{ width: 42 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.screenTitle}>Check what I saw</Text>
          <Text style={styles.screenSubtitle}>
            Review the items below and make any changes before we rescue your meal.
          </Text>

          {imageUri ? (
            <View style={styles.photoFrame}>
              <AppImage source={{ uri: imageUri }} style={styles.photo} contentFit="cover" />
            </View>
          ) : null}

          {nothingRecognized ? (
            <View style={styles.emptyState}>
              <Ionicons name="eye-off-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Nothing recognized</Text>
              <Text style={styles.emptySub}>Go back and type what you ate instead.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{"Here's what I picked up"}</Text>
              <Text style={styles.sectionHint}>Tap a food to edit its name or to remove it</Text>

              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.itemCard, isEditing && styles.itemCardEditing]}
                    onPress={() => setEditingId(isEditing ? null : item.id)}
                  >
                    {isEditing ? (
                      <View style={styles.editRow}>
                        <TextInput
                          style={styles.editInput}
                          value={item.name}
                          onChangeText={(text) => updateName(item.id, text)}
                          placeholder="Food name"
                          placeholderTextColor={colors.textSecondary}
                          autoFocus
                          onBlur={() => {
                            if (!item.name.trim()) removeItem(item.id);
                            setEditingId(null);
                          }}
                        />
                        <Pressable
                          style={styles.deleteBtn}
                          onPress={() => removeItem(item.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${item.name}`}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.error} />
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                      </>
                    )}
                  </Pressable>
                );
              })}

              {addInputVisible ? (
                <View style={styles.addInputRow}>
                  <RNTextInput
                    ref={addInputRef}
                    style={styles.addInput}
                    value={addInputValue}
                    onChangeText={setAddInputValue}
                    placeholder="Type a food or ingredient"
                    placeholderTextColor={colors.textSecondary}
                    onSubmitEditing={handleAddSubmit}
                    returnKeyType="done"
                    onBlur={() => {
                      if (submittedViaButton.current) {
                        setAddInputVisible(false);
                        return;
                      }
                      if (addInputValue.trim()) {
                        addItem(addInputValue);
                      } else {
                        setAddInputVisible(false);
                      }
                    }}
                  />
                  <Pressable
                    style={styles.addConfirmBtn}
                    onPress={handleAddSubmit}
                    accessibilityRole="button"
                    accessibilityLabel="Add item"
                  >
                    <Ionicons name="checkmark" size={20} color={colors.homeButton} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.addButton}
                  onPress={handleAddPress}
                  accessibilityRole="button"
                  accessibilityLabel="Add something I missed"
                >
                  <Ionicons name="add" size={20} color={colors.textSecondary} />
                  <View style={styles.addTextCol}>
                    <Text style={styles.addTitle}>Add something I missed</Text>
                    <Text style={styles.addHint}>Type a food or ingredient</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </>
          )}

          {nothingRecognized ? (
            <View style={styles.footerRow}>
              <Pressable
                style={styles.retakeBtn}
                onPress={handleRetake}
                accessibilityRole="button"
                accessibilityLabel="Take another photo"
              >
                <Ionicons name="camera-outline" size={20} color={colors.homeInk} />
                <Text style={styles.retakeText}>Retake photo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerRow}>
              <Pressable
                style={styles.retakeBtn}
                onPress={handleRetake}
                accessibilityRole="button"
                accessibilityLabel="Take a different photo"
              >
                <Ionicons name="camera-outline" size={20} color={colors.homeInk} />
                <Text style={styles.retakeText}>Retake photo</Text>
              </Pressable>
              <Pressable
                style={styles.rescueBtn}
                onPress={handleContinue}
                accessibilityRole="button"
                accessibilityLabel="Looks good, rescue it"
              >
                <Text style={styles.rescueText}>Looks good</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function deriveItems(analysis: {
  detectedFoods: Array<{ name: string }>;
  detectedIngredients: Array<{ name: string }>;
}): RecognizedItem[] {
  return [
    ...analysis.detectedIngredients.map((ing) => ({
      name: ing.name,
      itemType: 'INGREDIENT' as const,
      confidence: 0.7,
      quantity: null,
      unit: null,
      servings: null,
    })),
    ...analysis.detectedFoods.map((food) => ({
      name: food.name,
      itemType: 'PREPARED_MEAL' as const,
      confidence: 0.7,
      quantity: null,
      unit: null,
      servings: null,
    })),
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: fonts.display,
    color: colors.homeInk,
    letterSpacing: -0.4,
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  screenSubtitle: {
    ...typography.body,
    color: colors.homeTextSecondary,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  photoFrame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: colors.primaryLight,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: fonts.display,
    color: colors.homeInk,
    letterSpacing: -0.3,
    lineHeight: 28,
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    marginBottom: spacing.sm,
  },
  itemCardEditing: {
    borderColor: colors.homeButton,
  },
  itemName: {
    ...typography.body,
    color: colors.homeInk,
    flex: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  editInput: {
    ...typography.body,
    color: colors.homeInk,
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md,
    paddingVertical: 18,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  addTextCol: {
    flex: 1,
  },
  addTitle: {
    ...typography.body,
    color: colors.homeInk,
    fontWeight: '500',
  },
  addHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  addInput: {
    ...typography.body,
    color: colors.homeInk,
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.homeButton,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addConfirmBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.subhead,
    color: colors.text,
  },
  emptySub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retakeText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.homeInk,
  },
  rescueBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.homeButton,
  },
  rescueText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: '#fff',
  },
});
