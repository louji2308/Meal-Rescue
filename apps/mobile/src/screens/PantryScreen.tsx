import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PantryItem, PantryUpsertRequest } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import {
  deletePantryItem,
  getPantry,
  markPantryItemUsed,
  upsertPantryItem,
} from '../services/pantry.api';
import { colors, spacing, typography } from '../theme';

/**
 * Pantry - inventory with expiry awareness (Phase 4).
 * List items with expiry badges, add/edit/delete, quantity/unit.
 * Tapping an item marks it as used (decrements qty).
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

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newExpiry, setNewExpiry] = useState('');

  useEffect(() => {
    loadPantry();
  }, []);

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
      const payload: PantryUpsertRequest = {
        ingredientName: newName.trim(),
        quantity: newQty ? Number(newQty) : null,
        unit: newUnit || null,
        expiresAt: newExpiry ? new Date(newExpiry).toISOString() : null,
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

  async function handleDelete(itemId: string) {
    setBusy(true);
    try {
      await deletePantryItem(itemId);
      loadPantry();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUse(item: PantryItem) {
    setBusy(true);
    try {
      await markPantryItemUsed(item.id);
      loadPantry();
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
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.heading, styles.title]}>My Pantry</Text>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.8}
            onPress={() => setShowAdd(true)}
          >
            <Text style={styles.addButtonText}>+ Add Item</Text>
          </TouchableOpacity>
        </View>

        <ErrorBanner error={error} />

        {showAdd && (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>Add to Pantry</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingredient name"
              value={newName}
              onChangeText={setNewName}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={styles.smallInput}
                placeholder="Qty"
                value={newQty}
                onChangeText={setNewQty}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.smallInput}
                placeholder="Unit (g, pcs, cup)"
                value={newUnit}
                onChangeText={setNewUnit}
              />
              <TextInput
                style={styles.smallInput}
                placeholder="Expiry (YYYY-MM-DD)"
                value={newExpiry}
                onChangeText={setNewExpiry}
              />
            </View>
            <View style={styles.formActions}>
              <PrimaryButton
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowAdd(false);
                  setNewName('');
                  setNewQty('');
                  setNewUnit('');
                  setNewExpiry('');
                }}
              />
              <PrimaryButton
                label="Add"
                onPress={() => void handleAdd()}
                busy={busy}
                disabled={!newName.trim()}
              />
            </View>
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
            <Text style={styles.emptyText}>Pantry is empty. Tap + Add Item to start.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                activeOpacity={0.7}
                onPress={() => handleUse(item)}
                onLongPress={() => handleDelete(item.id)}
              >
                <View style={styles.itemMain}>
                  <Text style={styles.itemName}>{item.ingredientName}</Text>
                  {expiryBadge(item)}
                </View>
                <View style={styles.itemDetails}>
                  {item.quantity !== null && (
                    <Text style={styles.itemQty}>
                      {item.quantity}
                      {item.unit ? ' ' + item.unit : ''}
                    </Text>
                  )}
                  <Text style={styles.itemHint}>Tap to use · Long press to delete</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
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
    padding: spacing.lg,
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
    backgroundColor: colors.primary,
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
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
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
  smallInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  section: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
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
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
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
  },
  expiryBadgeExpiring: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: '#E65100',
  },
  expiryBadgeLow: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 12,
    color: '#F57F17',
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
  itemHint: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
