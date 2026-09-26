import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Skeleton } from '../components/Skeleton';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import { PressableScale } from '../components/motion/PressableScale';
import type { KitchenStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { haptics } from '../services/haptics';
import {
  type WhatCanIMakeIdea,
  deleteKitchenItem,
  markKitchenItemUsed,
  upsertKitchenItem,
  whatCanIMake,
} from '../services/kitchen.api';
import { colors, fonts, radius, spacing } from '../theme';

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

function getExpiryColor(days: number | null): string {
  if (days === null) return colors.kitchenSecondary;
  if (days <= 1) return '#D95C54';
  if (days <= 3) return '#B08A3D';
  return '#5C7A4B';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ──────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────

export function IngredientDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<KitchenStackParamList, 'IngredientDetail'>>();
  const item = route.params.item;

  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [makeIdeas, setMakeIdeas] = useState<WhatCanIMakeIdea[]>([]);
  const [makeBusy, setMakeBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  const expiryColor = getExpiryColor(item.daysUntilExpiry);
  const isExpiringSoon = item.daysUntilExpiry !== null && item.daysUntilExpiry <= 2;

  const loadSuggestions = useCallback(async () => {
    setMakeBusy(true);
    try {
      const res = await whatCanIMake();
      setMakeIdeas(
        res.ideas
          .filter((idea) =>
            idea.ingredients.some((ing) => ing.toLowerCase() === item.ingredientName.toLowerCase()),
          )
          .slice(0, 3),
      );
    } catch (err) {
      // Silently fail — suggestions are nice-to-have
    } finally {
      setMakeBusy(false);
    }
  }, [item.ingredientName]);

  React.useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  async function handleQuantityChange(delta: number) {
    haptics.light();
    const newQty = Math.max(0, quantity + delta);
    setQuantity(newQty);
    try {
      await upsertKitchenItem({
        ingredientName: item.ingredientName,
        quantity: newQty,
        mergeQuantity: false,
      });
    } catch {
      setQuantity(quantity); // revert
    }
  }

  function confirmUse() {
    Alert.alert(
      item.kind === 'leftover' ? 'Serve leftover?' : 'Use ingredient?',
      item.kind === 'leftover'
        ? `Serve one portion of ${item.dishName ?? item.ingredientName}?`
        : `Use 1 ${item.unit ? `${item.unit} of ` : ''}${item.ingredientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use 1',
          style: 'destructive',
          onPress: async () => {
            try {
              await markKitchenItemUsed(item.id);
              navigation.goBack();
            } catch (err) {
              setError(toApiError(err));
            }
          },
        },
      ],
    );
  }

  function confirmDelete() {
    haptics.warning();
    Alert.alert('Remove item?', `Delete ${item.ingredientName} from your kitchen?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteKitchenItem(item.id);
            navigation.goBack();
          } catch (err) {
            setError(toApiError(err));
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={dStyles.container} edges={['top']}>
      <FadeInView style={dStyles.container}>
        {/* ── Header ── */}
        <View style={dStyles.header}>
          <Pressable style={dStyles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.kitchenInk} />
          </Pressable>
          <Text style={dStyles.headerTitle}>{item.ingredientName}</Text>
          <Pressable style={dStyles.deleteBtn} onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={18} color={colors.kitchenAlert} />
          </Pressable>
        </View>

        {error ? <ErrorBanner error={error} /> : null}

        <ScrollView
          contentContainerStyle={dStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Image area ── */}
          <View style={dStyles.imageArea}>
            <View style={dStyles.imagePlaceholder}>
              <Ionicons name="nutrition-outline" size={48} color={colors.kitchenTertiary} />
            </View>
          </View>

          {/* ── Info card ── */}
          <View style={dStyles.infoCard}>
            <View style={dStyles.infoRow}>
              <Text style={dStyles.infoLabel}>Quantity</Text>
              <View style={dStyles.qtyControl}>
                <Pressable
                  style={[dStyles.qtyBtn, quantity <= 0 && dStyles.qtyBtnDisabled]}
                  onPress={() => handleQuantityChange(-1)}
                  disabled={quantity <= 0}
                >
                  <Text style={dStyles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={dStyles.qtyValue}>{quantity}</Text>
                <Pressable style={dStyles.qtyBtn} onPress={() => handleQuantityChange(1)}>
                  <Text style={dStyles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={dStyles.infoDivider} />

            <View style={dStyles.infoRow}>
              <Text style={dStyles.infoLabel}>Added</Text>
              <Text style={dStyles.infoValue}>{formatDate(item.addedAt)}</Text>
            </View>

            {item.expiresAt && (
              <>
                <View style={dStyles.infoDivider} />
                <View style={dStyles.infoRow}>
                  <Text style={dStyles.infoLabel}>Expires</Text>
                  <Text style={[dStyles.infoValue, { color: expiryColor }]}>
                    {item.daysUntilExpiry !== null
                      ? item.daysUntilExpiry <= 0
                        ? 'Today'
                        : item.daysUntilExpiry === 1
                          ? 'Tomorrow'
                          : `${item.daysUntilExpiry} days`
                      : formatDate(item.expiresAt)}
                  </Text>
                </View>
              </>
            )}

            {item.kind === 'leftover' && item.dishName && (
              <>
                <View style={dStyles.infoDivider} />
                <View style={dStyles.infoRow}>
                  <Text style={dStyles.infoLabel}>Dish</Text>
                  <Text style={dStyles.infoValue}>{item.dishName}</Text>
                </View>
              </>
            )}

            {item.servings != null && (
              <>
                <View style={dStyles.infoDivider} />
                <View style={dStyles.infoRow}>
                  <Text style={dStyles.infoLabel}>Servings</Text>
                  <Text style={dStyles.infoValue}>{item.servings}</Text>
                </View>
              </>
            )}

            {item.notes && (
              <>
                <View style={dStyles.infoDivider} />
                <View style={dStyles.infoRow}>
                  <Text style={dStyles.infoLabel}>Notes</Text>
                  <Text style={dStyles.infoValue}>{item.notes}</Text>
                </View>
              </>
            )}
          </View>

          {/* ── Expiry warning ── */}
          {isExpiringSoon && (
            <View style={[dStyles.alertCard, { backgroundColor: colors.errorSoft }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#D95C54" />
              <Text style={dStyles.alertText}>
                {item.daysUntilExpiry !== null && item.daysUntilExpiry <= 0
                  ? 'This item expires today — use it now!'
                  : `This item expires in ${item.daysUntilExpiry} day${item.daysUntilExpiry === 1 ? '' : 's'}`}
              </Text>
            </View>
          )}

          {/* ── What can we rescue? ── */}
          {makeIdeas.length > 0 && (
            <>
              <Text style={dStyles.sectionTitle}>What can we rescue?</Text>
              {makeIdeas.map((idea, idx) => (
                <PressableScale
                  key={`${idea.name}-${idx}`}
                  scaleTo={0.98}
                  pressedTintOpacity={0.04}
                  style={dStyles.recipeCard}
                  onPress={() => {}}
                >
                  <View style={dStyles.recipeHeader}>
                    <Text style={dStyles.recipeName}>{idea.name}</Text>
                    <Text style={dStyles.recipeTime}>~{idea.estimatedMinutes} min</Text>
                  </View>
                  <Text style={dStyles.recipeDesc} numberOfLines={2}>
                    {idea.description}
                  </Text>
                  <Text style={dStyles.recipeIngredients} numberOfLines={1}>
                    Uses {idea.ingredients.join(', ')}
                  </Text>
                </PressableScale>
              ))}
            </>
          )}

          {makeBusy && (
            <View style={dStyles.loadingRow}>
              <Skeleton.Block width="100%" height={16} />
              <Skeleton.Block width="80%" height={16} />
            </View>
          )}

          {/* ── Actions ── */}
          <View style={dStyles.actions}>
            <PrimaryButton label="Use 1" onPress={confirmUse} variant="primary" />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </FadeInView>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────

const H_PAD = 24;

const dStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '400',
    color: colors.kitchenInk,
    textAlign: 'center',
    lineHeight: 25,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingBottom: spacing.xl,
  },

  // Image area
  imageArea: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.xl,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Info card
  infoCard: {
    backgroundColor: colors.kitchenSurface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.kitchenSecondary,
  },
  infoValue: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.kitchenInk,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.kitchenDivider,
  },

  // Quantity control
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.3,
  },
  qtyBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    fontWeight: '600',
    color: colors.kitchenInk,
  },
  qtyValue: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    fontWeight: '700',
    color: colors.kitchenInk,
    minWidth: 24,
    textAlign: 'center',
  },

  // Alert
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  alertText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    fontWeight: '500',
    color: '#D95C54',
  },

  // Section
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    fontWeight: '600',
    color: colors.kitchenInk,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Recipe card
  recipeCard: {
    backgroundColor: colors.kitchenSurface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  recipeName: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.kitchenInk,
    flex: 1,
  },
  recipeTime: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.kitchenSecondary,
  },
  recipeDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.kitchenSecondary,
    lineHeight: 18,
  },
  recipeIngredients: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.kitchenTertiary,
    marginTop: spacing.xs,
  },

  // Loading
  loadingRow: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },

  // Actions
  actions: {
    marginTop: spacing.lg,
  },
});
