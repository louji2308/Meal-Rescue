import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextInput } from '../components/AppTextInput';
import type { CaptureConfirmItem, CaptureResult, CapturedItem } from '../services/kitchen.api';
import { confirmCapture } from '../services/kitchen.api';
import { colors, radius, spacing, typography } from '../theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  result: CaptureResult;
  onDone: (summary: { added: number; updated: number; skipped: number }) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierColor(tier: 'HIGH' | 'MEDIUM' | 'LOW') {
  switch (tier) {
    case 'HIGH':
      return colors.success;
    case 'MEDIUM':
      return colors.primary;
    case 'LOW':
      return colors.textSecondary;
  }
}

function tierLabel(tier: 'HIGH' | 'MEDIUM' | 'LOW') {
  switch (tier) {
    case 'HIGH':
      return 'Confirmed';
    case 'MEDIUM':
      return 'Uncertain';
    case 'LOW':
      return 'Unclear';
  }
}

function stateLabel(state: string) {
  switch (state) {
    case 'RAW':
      return 'Raw';
    case 'COOKED':
      return 'Cooked';
    case 'READY_TO_EAT':
      return 'Ready to eat';
    default:
      return '';
  }
}

function formatExpiry(days: number | null): string {
  if (days == null) return 'No expiry set';
  if (days === 0) return 'Use today';
  if (days === 1) return 'Use tomorrow';
  if (days < 7) return `Use in ${days} days`;
  if (days < 30)
    return `Use in ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}`;
  return `Use in ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'}`;
}

function expiryDateFromDays(days: number | null): string {
  if (days == null) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EXPIRY_PRESETS = [1, 2, 3, 5, 7, 14, 30];

const QTY_STEP: Record<string, number> = {
  pcs: 1,
  g: 50,
  kg: 0.5,
  L: 0.25,
  ml: 50,
};

// ---------------------------------------------------------------------------
// Item card
// ---------------------------------------------------------------------------

function ItemCard({
  item,
  onUpdate,
}: {
  item: CapturedItem;
  onUpdate: (id: string, patch: Partial<CaptureConfirmItem>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(item.displayName);
  const [qty, setQty] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit ?? 'g');
  const [servings, setServings] = useState(item.servings);
  const [expiryDays, setExpiryDays] = useState(item.estimatedExpiryDays);

  const step = QTY_STEP[unit] ?? 1;
  const isFood = item.itemType === 'PREPARED_MEAL' || item.itemType === 'LEFTOVER';

  const handleAccept = useCallback(() => {
    onUpdate(item.id, {
      accepted: true,
      displayName: editName,
      quantity: qty,
      unit,
      servings,
      estimatedExpiryDays: expiryDays,
    });
  }, [item.id, editName, qty, unit, servings, expiryDays, onUpdate]);

  const handleReject = useCallback(() => {
    onUpdate(item.id, { accepted: false });
  }, [item.id, onUpdate]);

  const handleDuplicateAction = useCallback(
    (action: 'UPDATE' | 'ADD_MORE' | 'SKIP') => {
      onUpdate(item.id, {
        accepted: true,
        displayName: editName,
        quantity: qty,
        unit,
        servings,
        estimatedExpiryDays: expiryDays,
        duplicateAction: action,
      });
    },
    [item.id, editName, qty, unit, servings, expiryDays, onUpdate],
  );

  const adjustQty = useCallback((delta: number) => {
    setQty((prev) => {
      const next = (prev ?? 0) + delta;
      return next < 0 ? 0 : Math.round(next * 100) / 100;
    });
  }, []);

  const adjustExpiry = useCallback((delta: number) => {
    setExpiryDays((prev) => {
      const next = (prev ?? 7) + delta;
      return next < 0 ? 0 : next;
    });
  }, []);

  const adjustServings = useCallback((delta: number) => {
    setServings((prev) => {
      const next = (prev ?? 2) + delta;
      return Math.min(50, Math.max(1, next));
    });
  }, []);

  const hasDuplicate = !!item.duplicateOf;
  const tierCol = tierColor(item.confidenceTier);

  return (
    <View style={[styles.card, { borderLeftColor: tierCol }]}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.cardInfo}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>
              {editName}
            </Text>
            <View style={[styles.tierBadge, { backgroundColor: tierCol + '18' }]}>
              <Text style={[styles.tierText, { color: tierCol }]}>
                {tierLabel(item.confidenceTier)}
              </Text>
            </View>
          </View>

          {/* Quantity + unit row */}
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardMeta}>{stateLabel(item.state)}</Text>
            {qty != null && (
              <Text style={styles.cardQty}>
                {qty} {unit}
              </Text>
            )}
            {expiryDays != null && (
              <Text style={styles.cardExpiry}>
                · {formatExpiry(expiryDays)}
                {expiryDateFromDays(expiryDays) ? ` (${expiryDateFromDays(expiryDays)})` : ''}
              </Text>
            )}
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          {/* Duplicate notice */}
          {hasDuplicate && (
            <View style={styles.duplicateBanner}>
              <Text style={styles.duplicateBannerText}>
                Already in kitchen: {item.duplicateOf!.currentQuantity}
                {item.duplicateOf!.currentUnit ?? ''}
              </Text>
              <View style={styles.duplicateActions}>
                <TouchableOpacity
                  style={styles.dupAction}
                  onPress={() => handleDuplicateAction('UPDATE')}
                >
                  <Text style={styles.dupActionText}>Replace</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dupAction}
                  onPress={() => handleDuplicateAction('ADD_MORE')}
                >
                  <Text style={styles.dupActionText}>Add more</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dupAction, styles.dupSkip]}
                  onPress={() => handleDuplicateAction('SKIP')}
                >
                  <Text style={[styles.dupActionText, { color: colors.textSecondary }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Name */}
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.nameInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Item name"
          />

          {/* Quantity */}
          <Text style={styles.label}>Quantity</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(-step)}>
              <Ionicons name="remove" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              value={qty != null ? String(qty) : ''}
              onChangeText={(t) => setQty(t ? Number(t) : null)}
              keyboardType="decimal-pad"
              placeholder="—"
            />
            <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(step)}>
              <Ionicons name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
            <View style={styles.unitPills}>
              {['pcs', 'g', 'kg', 'L', 'ml'].map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitPill, unit === u && styles.unitPillActive]}
                  onPress={() => setUnit(u)}
                >
                  <Text style={[styles.unitPillText, unit === u && styles.unitPillTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Servings (prepared meals / leftovers only) */}
          {isFood && (
            <>
              <Text style={styles.label}>Servings</Text>
              <View style={styles.servingsRow}>
                <TouchableOpacity style={styles.servingsBtn} onPress={() => adjustServings(-1)}>
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.servingsValue}>{servings ?? 2}</Text>
                <TouchableOpacity style={styles.servingsBtn} onPress={() => adjustServings(1)}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Expiry */}
          <Text style={styles.label}>Best before</Text>
          <View style={styles.expiryRow}>
            <TouchableOpacity style={styles.expiryBtn} onPress={() => adjustExpiry(-1)}>
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.expiryValue}>
              {expiryDays != null ? formatExpiry(expiryDays) : 'None'}
            </Text>
            <TouchableOpacity style={styles.expiryBtn} onPress={() => adjustExpiry(1)}>
              <Ionicons name="add" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.expiryPresets}>
            {EXPIRY_PRESETS.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.expiryPreset, expiryDays === d && styles.expiryPresetActive]}
                onPress={() => setExpiryDays(d)}
              >
                <Text
                  style={[
                    styles.expiryPresetText,
                    expiryDays === d && styles.expiryPresetTextActive,
                  ]}
                >
                  {d}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Accept / Reject */}
          <View style={styles.acceptRejectRow}>
            <TouchableOpacity style={styles.rejectBtn} onPress={handleReject}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
              <Text style={styles.rejectText}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.acceptText}>Keep</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function KitchenCaptureReviewScreen({ result, onDone, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Map<string, CaptureConfirmItem>>(() => {
    const map = new Map<string, CaptureConfirmItem>();
    for (const item of result.items) {
      map.set(item.id, {
        id: item.id,
        accepted: item.confidenceTier === 'HIGH',
        displayName: item.displayName,
        itemType: item.itemType,
        state: item.state,
        quantity: item.quantity,
        unit: item.unit,
        servings: item.servings,
        estimatedExpiryDays: item.estimatedExpiryDays,
        duplicateAction: item.duplicateOf ? 'UPDATE' : undefined,
      });
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [doneResult, setDoneResult] = useState<{
    added: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const handleUpdate = useCallback((id: string, patch: Partial<CaptureConfirmItem>) => {
    setItems((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const summary = useMemo(() => {
    const arr = Array.from(items.values());
    return {
      total: arr.length,
      accepted: arr.filter((i) => i.accepted).length,
      rejected: arr.filter((i) => !i.accepted).length,
    };
  }, [items]);

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      const payload = Array.from(items.values());
      const result = await confirmCapture(payload);
      setDoneResult(result);
      setDone(true);
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [items]);

  // --- Done screen ---
  if (done && doneResult) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
          <Text style={styles.doneTitle}>Kitchen updated</Text>
          <Text style={styles.doneSub}>
            {doneResult.added} added
            {doneResult.updated > 0 ? ` · ${doneResult.updated} updated` : ''}
            {doneResult.skipped > 0 ? ` · ${doneResult.skipped} skipped` : ''}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => onDone(doneResult)}>
            <Text style={styles.doneBtnText}>Back to kitchen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Review screen ---
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review items</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {summary.accepted} of {summary.total} kept
        </Text>
      </View>

      {/* Items */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {result.items.map((item) => (
          <ItemCard key={item.id} item={item} onUpdate={handleUpdate} />
        ))}
      </ScrollView>

      {/* Confirm button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (submitting || summary.accepted === 0) && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={submitting || summary.accepted === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmText}>
              {summary.accepted > 0
                ? `Add ${summary.accepted} item${summary.accepted === 1 ? '' : 's'} to kitchen`
                : 'Nothing to add'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 50,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading,
    color: colors.text,
  },
  summaryBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  summaryText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardName: {
    ...typography.subhead,
    color: colors.text,
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tierText: {
    ...typography.bodySmall,
    fontWeight: '600',
    fontSize: 11,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  cardMeta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  cardQty: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  cardExpiry: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  // Card body
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: 10,
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
  // Quantity
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    minWidth: 60,
    textAlign: 'center',
  },
  unitPills: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
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
  // Servings (prepared meals / leftovers)
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  servingsBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  // Expiry
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expiryBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiryValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  expiryPresets: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  expiryPreset: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  expiryPresetActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  expiryPresetText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  expiryPresetTextActive: {
    color: colors.primary,
  },
  // Duplicate
  duplicateBanner: {
    backgroundColor: '#F59E0B15',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  duplicateBannerText: {
    ...typography.bodySmall,
    color: '#B45309',
    marginBottom: 6,
  },
  duplicateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dupAction: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  dupSkip: {
    backgroundColor: colors.textSecondary + '15',
  },
  dupActionText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  // Accept / Reject
  acceptRejectRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  rejectText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    gap: 4,
  },
  acceptText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  // Done
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  doneIcon: {
    marginBottom: spacing.md,
  },
  doneTitle: {
    ...typography.largeTitle,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  doneSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  doneBtnText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
});
