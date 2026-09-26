import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PantryItem, PantryUpsertRequest } from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import {
  type MarkUsedResult,
  deletePantryItem,
  getPantry,
  markPantryItemUsed,
  upsertPantryItem,
} from '../services/pantry.api';
import { PickedImage, analyzeMeal } from '../services/rescue.api';
import { colors, spacing, typography } from '../theme';

interface Toast {
  id: number;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Pantry - inventory with expiry awareness (Phase 4).
 *
 * Guardrails: tapping a row never mutates. Consuming ("Use") and deleting are
 * explicit, confirmed actions, and every mutation offers an in-app Undo so no
 * inventory is lost to an accidental tap.
 */
export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [expiringSoon, setExpiringSoon] = useState<PantryItem[]>([]);
  const [lowStock, setLowStock] = useState<PantryItem[]>([]);
  const [suggestedUses, setSuggestedUses] = useState<
    Array<{ ingredientName: string; reason: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newExpiry, setNewExpiry] = useState('');

  useEffect(() => {
    loadPantry();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function showToast(message: string, actionLabel: string, onAction: () => void) {
    setToast({ id: Date.now(), message, actionLabel, onAction });
  }

  function parseRelativeDate(input: string): string | null {
    const lower = input.toLowerCase().trim();
    const now = new Date();
    if (lower === 'today') return now.toISOString().slice(0, 10);
    if (lower === 'tomorrow' || lower === 'tmr') {
      now.setDate(now.getDate() + 1);
      return now.toISOString().slice(0, 10);
    }
    const inDays = lower.match(/^in\s+(\d+)\s+days?$/);
    if (inDays) {
      now.setDate(now.getDate() + parseInt(inDays[1], 10));
      return now.toISOString().slice(0, 10);
    }
    const daysMatch = lower.match(/^(\d+)\s+days?$/);
    if (daysMatch) {
      now.setDate(now.getDate() + parseInt(daysMatch[1], 10));
      return now.toISOString().slice(0, 10);
    }
    const isoMatch = input.trim().match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) return input.trim();
    return null;
  }

  async function loadPantry() {
    setBusy(true);
    try {
      const pantry = await getPantry();
      setItems(pantry.ingredients);
      setExpiringSoon(pantry.expiringSoon);
      setLowStock(pantry.lowStock);
      setSuggestedUses(pantry.suggestedUses);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const expiryDate = newExpiry.trim() ? parseRelativeDate(newExpiry) : null;
      const payload: PantryUpsertRequest = {
        ingredientName: newName.trim(),
        quantity: newQty ? Number(newQty) : null,
        unit: newUnit || null,
        expiresAt: expiryDate ? new Date(expiryDate).toISOString() : null,
        usePriority: 0,
      };
      await upsertPantryItem(payload);
      setShowAdd(false);
      setNewName('');
      setNewQty('');
      setNewUnit('');
      setNewExpiry('');
      loadPantry();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(item: PantryItem) {
    haptics.warning();
    const label =
      item.kind === 'leftover' ? (item.dishName ?? item.ingredientName) : item.ingredientName;
    Alert.alert('Remove item?', `Delete ${label} from your pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void handleDelete(item);
        },
      },
    ]);
  }

  async function handleDelete(item: PantryItem) {
    const previousItems = items;
    const previousExpiring = expiringSoon;
    const previousLowStock = lowStock;
    haptics.warning();
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setExpiringSoon((prev) => prev.filter((i) => i.id !== item.id));
    setLowStock((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deletePantryItem(item.id);
      await loadPantry();
      showToast(
        `Deleted ${item.kind === 'leftover' ? (item.dishName ?? item.ingredientName) : item.ingredientName}`,
        'Undo',
        () => {
          void handleUndoDelete(item);
        },
      );
    } catch (err) {
      setItems(previousItems);
      setExpiringSoon(previousExpiring);
      setLowStock(previousLowStock);
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndoDelete(item: PantryItem) {
    setBusy(true);
    try {
      const common: PantryUpsertRequest = {
        ingredientName: item.ingredientName,
        unit: item.unit ?? null,
        expiresAt: item.expiresAt ?? null,
      };
      if (item.kind === 'leftover') {
        const dishName = item.dishName ?? item.ingredientName;
        await upsertPantryItem({
          ...common,
          ingredientName: dishName,
          kind: 'leftover',
          dishName,
          servings: item.servings ?? 1,
          madeAt: item.madeAt ?? new Date().toISOString(),
        });
      } else {
        await upsertPantryItem({ ...common, quantity: item.quantity ?? null });
      }
      await loadPantry();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmUse(item: PantryItem) {
    const label =
      item.kind === 'leftover' ? (item.dishName ?? item.ingredientName) : item.ingredientName;
    Alert.alert(
      item.kind === 'leftover' ? 'Serve leftover?' : 'Use item?',
      item.kind === 'leftover'
        ? `Eat one serving of ${label}?`
        : `Use 1 ${item.unit ? `${item.unit} of ` : ''}${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: item.kind === 'leftover' ? 'Serve 1' : 'Use 1',
          style: 'destructive',
          onPress: () => {
            void handleUse(item);
          },
        },
      ],
    );
  }

  async function handleUse(item: PantryItem) {
    setBusy(true);
    try {
      const result = await markPantryItemUsed(item.id);
      await loadPantry();
      if (item.kind === 'leftover') {
        showToast(
          result.removed
            ? `Finished ${item.dishName ?? item.ingredientName}`
            : `Ate a serving of ${item.dishName ?? item.ingredientName}`,
          'Undo',
          () => {
            void handleUndoUse(item, result);
          },
        );
      } else if (result.removed) {
        showToast(`Used the last ${item.ingredientName}`, 'Undo', () => {
          void handleUndoUse(item, result);
        });
      } else {
        const unit = item.unit ? ` ${item.unit}` : '';
        showToast(`Used 1${unit} ${item.ingredientName}`, 'Undo', () => {
          void handleUndoUse(item, result);
        });
      }
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndoUse(item: PantryItem, result: MarkUsedResult) {
    setBusy(true);
    try {
      if (item.kind === 'leftover') {
        const dishName = item.dishName ?? item.ingredientName;
        const currentServings = result.removed ? 0 : (result.item?.servings ?? 1);
        await upsertPantryItem({
          ingredientName: dishName,
          kind: 'leftover',
          dishName,
          servings: result.removed ? 1 : currentServings + 1,
          notes: item.notes ?? null,
          madeAt: item.madeAt ?? new Date().toISOString(),
        });
      } else {
        await upsertPantryItem({
          ingredientName: item.ingredientName,
          unit: item.unit ?? null,
          quantity: 1,
          mergeQuantity: true,
        });
      }
      await loadPantry();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSnapGroceries() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(toApiError(new Error('Photo library access is needed to scan your groceries.')));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0]!;
    const image: PickedImage = {
      uri: asset.uri,
      name: asset.fileName ?? 'pantry.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    };

    setSnapBusy(true);
    try {
      const before = items;
      const analysis = await analyzeMeal({ image });
      const foods = analysis.detectedFoods.map((food) => food.name).filter(Boolean);
      if (foods.length === 0) {
        setError(
          toApiError(new Error("I couldn't spot anything in that photo. Try a clearer shot.")),
        );
        return;
      }
      const results: PantryItem[] = [];
      for (const name of foods) {
        const saved = await upsertPantryItem({
          ingredientName: name,
          quantity: 1,
          mergeQuantity: true,
          usePriority: 0,
        });
        results.push(saved);
      }
      await loadPantry();

      const unique = [...new Map(results.map((r) => [r.id, r])).values()];
      const names = unique.map((r) => r.ingredientName);
      const preview =
        names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
      showToast(
        `Added ${names.length} item${names.length === 1 ? '' : 's'}: ${preview}`,
        'Undo',
        () => {
          void handleUndoImport(results, before);
        },
      );

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 300);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSnapBusy(false);
    }
  }

  async function handleUndoImport(results: PantryItem[], before: PantryItem[]) {
    setBusy(true);
    try {
      const beforeById = new Map(before.map((i) => [i.id, i]));
      const unique = [...new Map(results.map((r) => [r.id, r])).values()];
      for (const result of unique) {
        const prior = beforeById.get(result.id);
        if (prior) {
          await upsertPantryItem({
            ingredientName: result.ingredientName,
            quantity: prior.quantity,
            unit: prior.unit ?? null,
            expiresAt: prior.expiresAt ?? null,
          });
        } else {
          await deletePantryItem(result.id);
        }
      }
      await loadPantry();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const expiryBadge = (item: PantryItem) => {
    if (item.isExpiringSoon) {
      return <Text style={styles.expiryBadgeExpiring}>Expires in {item.daysUntilExpiry}d</Text>;
    }
    if (item.isLowStock) {
      return <Text style={styles.expiryBadgeLow}>Low stock</Text>;
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <FadeInView style={styles.container}>
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[typography.heading, styles.title]}>My Pantry</Text>
            <Pressable style={styles.addButton} onPress={() => setShowAdd(true)}>
              <Text style={styles.addButtonText}>+ Add Item</Text>
            </Pressable>
          </View>

          <ErrorBanner error={error} />

          {showAdd && (
            <View style={styles.addForm}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Add to Pantry</Text>
                <Pressable
                  onPress={() => {
                    setShowAdd(false);
                    setNewName('');
                    setNewQty('');
                    setNewUnit('');
                    setNewExpiry('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close form"
                >
                  <Ionicons name="close" size={20} color={colors.softAlert} />
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                placeholder="What did you get?"
                placeholderTextColor={colors.textSecondary}
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.qtyInput}
                  placeholder="Qty"
                  placeholderTextColor={colors.textSecondary}
                  value={newQty}
                  onChangeText={setNewQty}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.unitInput}
                  placeholder="Unit"
                  placeholderTextColor={colors.textSecondary}
                  value={newUnit}
                  onChangeText={setNewUnit}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Expires (tomorrow, in 3 days)"
                placeholderTextColor={colors.textSecondary}
                value={newExpiry}
                onChangeText={setNewExpiry}
              />
              <PrimaryButton
                label="Add to pantry"
                onPress={() => void handleAdd()}
                busy={busy}
                disabled={!newName.trim()}
                style={styles.addButton}
              />
            </View>
          )}

          {(suggestedUses.length > 0 || expiringSoon.length > 0 || lowStock.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attention</Text>
              {suggestedUses.map((s) => (
                <View key={s.ingredientName} style={styles.alertItem}>
                  <Text>{s.ingredientName}</Text>
                  <Text style={styles.alertReason}>{s.reason}</Text>
                </View>
              ))}
              {expiringSoon.map((item) => (
                <View key={item.id} style={styles.alertItem}>
                  <Text>{item.ingredientName}</Text>
                  <Text style={styles.alertReason}>Expires in {item.daysUntilExpiry} day(s)</Text>
                </View>
              ))}
              {lowStock.map((item) => (
                <View key={item.id} style={styles.alertItem}>
                  <Text>{item.ingredientName}</Text>
                  <Text style={styles.alertReason}>
                    Low stock ({item.quantity}
                    {item.unit ? ' ' + item.unit : ''})
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Your Items</Text>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="basket-outline" size={64} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Your pantry is a blank plate.</Text>
              <Text style={styles.emptyText}>
                {snapBusy
                  ? 'Scraps is scanning your shelf…'
                  : 'Snap what you have on hand and I will stock it for you.'}
              </Text>
              <View style={styles.emptyActions}>
                <PrimaryButton
                  label="Snap your groceries"
                  onPress={() => void handleSnapGroceries()}
                  busy={snapBusy}
                  style={styles.emptyAction}
                />
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.item}
                  onLongPress={() => confirmDelete(item)}
                  delayLongPress={500}
                >
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName}>
                      {item.kind === 'leftover'
                        ? (item.dishName ?? item.ingredientName)
                        : item.ingredientName}
                    </Text>
                    {expiryBadge(item)}
                  </View>
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemQty}>
                      {item.kind === 'leftover'
                        ? item.servings !== null
                          ? `${item.servings} serving${item.servings === 1 ? '' : 's'}`
                          : 'Leftover'
                        : item.quantity !== null
                          ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}`
                          : 'On hand'}
                    </Text>
                    <Pressable
                      style={styles.useChip}
                      onPress={() => {
                        haptics.light();
                        confirmUse(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${item.ingredientName} as used`}
                    >
                      <Text style={styles.useChipText}>
                        {item.kind === 'leftover' ? 'Serve' : 'Use'}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {toast && (
            <Animated.View
              style={styles.toast}
              entering={SlideInRight.duration(280)}
              exiting={FadeOut.duration(200)}
            >
              <Text style={styles.toastText} numberOfLines={1}>
                {toast.message}
              </Text>
              <Pressable
                onPress={() => {
                  toast.onAction();
                  setToast(null);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Undo last action"
              >
                <Text style={styles.toastAction}>{toast.actionLabel}</Text>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>

        {/* Scanning overlay */}
        {snapBusy && (
          <Animated.View
            style={styles.scanningOverlay}
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(200)}
          >
            <Animated.View
              style={styles.scanningCard}
              entering={FadeIn.springify().damping(18).stiffness(120)}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.scanningTitle}>Scraps is scanning...</Text>
              <Text style={styles.scanningSubtitle}>Identifying your groceries</Text>
            </Animated.View>
          </Animated.View>
        )}
      </FadeInView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  addButtonText: {
    color: colors.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  addForm: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  unitInput: {
    flex: 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  section: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  alertItem: {
    marginBottom: spacing.xs,
  },
  alertReason: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  emptyAction: {},
  list: {
    gap: spacing.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  itemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  expiryBadgeExpiring: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: colors.textSecondary,
  },
  expiryBadgeLow: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: colors.secondary,
  },
  itemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  itemQty: {
    fontSize: 14,
    color: colors.text,
  },
  useChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  useChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  toastText: {
    flex: 1,
    color: colors.surface,
    fontSize: 14,
    fontWeight: '500',
  },
  toastAction: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scanningCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  scanningTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  scanningSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
