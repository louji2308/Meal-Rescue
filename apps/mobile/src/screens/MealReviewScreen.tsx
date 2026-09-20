import { Ionicons } from '@expo/vector-icons';
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecognizedItem } from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { haptics } from '../services/haptics';
import { colors, radius, spacing, typography } from '../theme';

const UNITS = ['pcs', 'g', 'kg', 'ml', 'l'] as const;

const ITEM_TYPE_LABEL: Record<RecognizedItem['itemType'], string> = {
  INGREDIENT: 'Ingredient',
  PREPARED_MEAL: 'Meal',
  LEFTOVER: 'Leftover',
  PACKAGED_FOOD: 'Packaged',
};

interface EditableItem {
  id: number;
  name: string;
  itemType: RecognizedItem['itemType'];
  quantity: number | null;
  unit: RecognizedItem['unit'];
  servings: number | null;
}

/**
 * Meal photo review (plan: Capture -> Review/Edit -> AiRescue).
 *
 * Shows every item the vision model saw with editable name, quantity and
 * unit; prepared meals and leftovers get an extra servings stepper ("roughly
 * how many people can eat this"). Only photo captures land here - text
 * captures skip straight to AiRescue as before.
 *
 * Bottom bar has two buttons:
 * - "Next" — accept and continue to rescue (hidden if no food recognized)
 * - "Take Again" — return to camera/gallery for a new photo
 */
export function MealReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const route = useRoute<RouteProp<HomeStackParamList, 'MealReview'>>();
  const { analysis } = route.params;

  const [items, setItems] = useState<EditableItem[]>(() =>
    (analysis.items?.length ? analysis.items : deriveItems(analysis)).map((item, index) => ({
      id: index,
      name: item.name,
      itemType: item.itemType,
      quantity: item.quantity ?? null,
      unit: item.unit ?? 'pcs',
      servings: item.servings ?? null,
    })),
  );

  const [busy, setBusy] = useState(false);

  const isFood = (type: RecognizedItem['itemType']) =>
    type === 'PREPARED_MEAL' || type === 'LEFTOVER';

  const updateItem = (id: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const adjustQty = (item: EditableItem, delta: number) => {
    const _step = item.unit === 'g' ? 50 : item.unit === 'kg' ? 0.5 : item.unit === 'ml' ? 50 : 1;
    const next = (item.quantity ?? 0) + delta;
    updateItem(item.id, { quantity: next < 0 ? 0 : Math.round(next * 100) / 100 });
  };

  const handleContinue = () => {
    setBusy(true);
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
  };

  const handleTakeAgain = () => {
    navigation.navigate('Capture');
  };

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
          <Ionicons name="chevron-back" size={24} color={colors.homeInk} />
        </Pressable>
        <Text style={styles.headerTitle}>Check what I saw</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Fix names, amounts and servings — then we'll figure out how to rescue it.
        </Text>

        {items.length === 0 && (
          <Text style={styles.empty}>Nothing recognized — go back and type it instead.</Text>
        )}

        {items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.typeBadge}>{ITEM_TYPE_LABEL[item.itemType]}</Text>
              {isFood(item.itemType) && <Text style={styles.typeHint}>~serves people</Text>}
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.nameInput}
              value={item.name}
              onChangeText={(text) => updateItem(item.id, { name: text })}
              placeholder="Item name"
            />

            <Text style={styles.label}>Amount</Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  haptics.light();
                  adjustQty(item, -1);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="remove" size={18} color={colors.primary} />
              </Pressable>
              <TextInput
                style={styles.qtyInput}
                value={item.quantity != null ? String(item.quantity) : ''}
                onChangeText={(t) => updateItem(item.id, { quantity: t ? Number(t) : null })}
                keyboardType="decimal-pad"
                placeholder="—"
              />
              <Pressable
                style={styles.qtyBtn}
                onPress={() => {
                  haptics.light();
                  adjustQty(item, 1);
                }}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={colors.primary} />
              </Pressable>
              <View style={styles.unitPills}>
                {UNITS.map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.unitPill, item.unit === u && styles.unitPillActive]}
                    onPress={() => {
                      haptics.light();
                      updateItem(item.id, { unit: u });
                    }}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[styles.unitPillText, item.unit === u && styles.unitPillTextActive]}
                    >
                      {u}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {isFood(item.itemType) && (
              <>
                <Text style={styles.label}>Servings ({item.servings ?? 1})</Text>
                <View style={styles.servingsRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      updateItem(item.id, {
                        servings: Math.max(1, (item.servings ?? 1) - 1),
                      })
                    }
                    accessibilityRole="button"
                  >
                    <Ionicons name="remove" size={18} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.servingsValue}>{item.servings ?? 1}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      updateItem(item.id, {
                        servings: Math.min(50, (item.servings ?? 1) + 1),
                      })
                    }
                    accessibilityRole="button"
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.servingsNote}>How many can eat this?</Text>
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>

      {nothingRecognized ? (
        <View style={styles.footer}>
          <Text style={styles.noFoodMsg}>
            No food recognized — take another photo or type it instead.
          </Text>
          <Pressable
            style={styles.takeAgainBtn}
            onPress={handleTakeAgain}
            accessibilityRole="button"
            accessibilityLabel="Take another photo"
          >
            <Ionicons name="camera" size={18} color={colors.primary} />
            <Text style={styles.takeAgainText}>Take Again</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Pressable
              style={styles.takeAgainBtn}
              onPress={handleTakeAgain}
              accessibilityRole="button"
              accessibilityLabel="Take a different photo"
            >
              <Ionicons name="camera" size={18} color={colors.primary} />
              <Text style={styles.takeAgainText}>Take Again</Text>
            </Pressable>
            <Pressable
              style={[styles.nextBtn, busy && styles.nextBtnDisabled]}
              onPress={handleContinue}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with these items"
            >
              <Text style={styles.nextText}>
                {busy ? 'Working…' : `Next · rescue ${keptCount}`}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function deriveItems(analysis: {
  detectedFoods: Array<{ name: string }>;
  detectedIngredients: Array<{ name: string }>;
}): RecognizedItem[] {
  const items: RecognizedItem[] = [
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
      servings: 2,
    })),
  ];
  return items;
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
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(22, 22, 22, 0.08)',
  },
  headerTitle: {
    ...typography.subhead,
    color: colors.text,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  typeHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 6,
    fontWeight: '600',
  },
  nameInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    textAlign: 'center',
  },
  unitPills: {
    flexDirection: 'row',
    gap: 4,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unitPillActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  unitPillText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },
  unitPillTextActive: {
    color: colors.primary,
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  servingsValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  servingsNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  noFoodMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  takeAgainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  takeAgainText: {
    ...typography.subhead,
    color: colors.primary,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
  },
  nextBtnDisabled: {
    opacity: 0.5,
  },
  nextText: {
    ...typography.subhead,
    color: '#fff',
    fontWeight: '700',
  },
});
