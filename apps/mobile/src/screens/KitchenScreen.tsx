import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { toApiError } from '../services/api';
import {
  type KitchenDashboard,
  type KitchenItem,
  type KitchenSignal,
  type KitchenOpportunity,
  type WhatCanIMakeIdea,
  type IdentifyFood,
  getKitchenDashboard,
  identifyKitchenFood,
  whatCanIMake,
  upsertKitchenItem,
  deleteKitchenItem,
  markKitchenItemUsed,
} from '../services/kitchen.api';
import { colors, spacing, typography } from '../theme';

type ViewMode = 'explore' | 'manage';

const STATE_COLORS: Record<string, string> = {
  fresh: colors.success,
  opened: '#F59E0B',
  leftover: '#8B5CF6',
  use_soon: colors.error,
  gone: colors.textSecondary,
};

const STATE_LABELS: Record<string, string> = {
  fresh: 'Fresh',
  opened: 'Opened',
  leftover: 'Leftover',
  use_soon: 'Use soon',
  gone: 'Gone',
};

const SIGNAL_ICONS: Record<string, string> = {
  use_first: 'alert-circle',
  almost_a_meal: 'restaurant',
  expiring_soon: 'time',
  low_stock: 'trending-down',
  unused_long: 'hourglass',
};

export function KitchenScreen() {
  const [view, setView] = useState<ViewMode>('explore');
  const [dashboard, setDashboard] = useState<KitchenDashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  // Camera
  const [identifyBusy, setIdentifyBusy] = useState(false);

  // Add item form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');

  // What can I make
  const [showMakeMode, setShowMakeMode] = useState(false);
  const [makeIdeas, setMakeIdeas] = useState<WhatCanIMakeIdea[]>([]);
  const [makeBusy, setMakeBusy] = useState(false);
  const [makeExpandedIdx, setMakeExpandedIdx] = useState<number | null>(null);

  // Opportunity expansion
  const [expandedOpportunity, setExpandedOpportunity] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await getKitchenDashboard();
      setDashboard(data);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // --- Camera food identification ---
  async function handleCameraPick(source: 'camera' | 'library') {
    setError(null);
    const permResult =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      setError(toApiError(new Error('Permission needed to identify food')));
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          });

    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0]!;

    setIdentifyBusy(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const response = await identifyKitchenFood(
        base64,
        asset.mimeType ?? 'image/jpeg',
      );
      // Auto-add identified foods
      for (const food of response.foods) {
        if (food.confidence > 0.5) {
          await upsertKitchenItem({
            ingredientName: food.name,
            expiresAt: food.estimatedExpiryDays
              ? new Date(
                  Date.now() + food.estimatedExpiryDays * 86400000,
                ).toISOString()
              : undefined,
          });
        }
      }
      loadDashboard();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setIdentifyBusy(false);
    }
  }

  // --- Add item manually ---
  async function handleAddItem() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await upsertKitchenItem({
        ingredientName: newName.trim(),
        quantity: newQty ? Number(newQty) : undefined,
        unit: newUnit || undefined,
      });
      setShowAdd(false);
      setNewName('');
      setNewQty('');
      setNewUnit('');
      loadDashboard();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  // --- Mark item used ("I ate some") ---
  async function handleMarkUsed(item: KitchenItem) {
    setBusy(true);
    try {
      await markKitchenItemUsed(item.id);
      loadDashboard();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  // --- Delete item ---
  async function handleDeleteItem(item: KitchenItem) {
    setBusy(true);
    try {
      await deleteKitchenItem(item.id);
      loadDashboard();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  // --- What can I make? ---
  async function handleWhatCanIMake() {
    setMakeBusy(true);
    setShowMakeMode(true);
    try {
      const response = await whatCanIMake();
      setMakeIdeas(response.ideas);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setMakeBusy(false);
    }
  }

  // --- Signal priority badge ---
  function signalBadge(priority: string) {
    const badgeColor =
      priority === 'urgent'
        ? colors.error
        : priority === 'high'
          ? '#F59E0B'
          : priority === 'medium'
            ? colors.secondary
            : colors.textSecondary;
    return (
      <View style={[styles.signalBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.signalBadgeText}>{priority}</Text>
      </View>
    );
  }

  // --- Effort badge ---
  function effortBadge(effort: string) {
    const badgeColor =
      effort === 'low' ? colors.success : effort === 'medium' ? '#F59E0B' : colors.error;
    return (
      <View style={[styles.effortBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.effortBadgeText}>{effort}</Text>
      </View>
    );
  }

  // --- Item card ---
  function renderItem({ item }: { item: KitchenItem }) {
    return (
      <TouchableOpacity
        style={styles.itemCard}
        activeOpacity={0.7}
        onPress={() => handleMarkUsed(item)}
        onLongPress={() => handleDeleteItem(item)}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemNameRow}>
            <View
              style={[styles.stateDot, { backgroundColor: STATE_COLORS[item.state] ?? colors.textSecondary }]}
            />
            <Text style={styles.itemName}>{item.ingredientName}</Text>
          </View>
          {item.quantity !== null && (
            <Text style={styles.itemQty}>
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ''}
            </Text>
          )}
        </View>
        <View style={styles.itemMeta}>
          <View style={[styles.stateBadge, { backgroundColor: STATE_COLORS[item.state] + '20' }]}>
            <Text style={[styles.stateText, { color: STATE_COLORS[item.state] }]}>
              {STATE_LABELS[item.state] ?? item.state}
            </Text>
          </View>
          <Text style={styles.itemHint}>{item.stateReason}</Text>
        </View>
        {item.isExpiringSoon && (
          <View style={styles.expiryWarning}>
            <Ionicons name="time" size={14} color={colors.error} />
            <Text style={styles.expiryWarningText}>
              Expires in {item.daysUntilExpiry} day{item.daysUntilExpiry === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // --- Signal card ---
  function renderSignal(signal: KitchenSignal) {
    const iconName = SIGNAL_ICONS[signal.type] ?? 'information-circle';
    return (
      <TouchableOpacity
        key={signal.id}
        style={styles.signalCard}
        activeOpacity={0.8}
        onPress={() => {
          if (signal.actionPayload === 'what-can-i-make') {
            handleWhatCanIMake();
          }
        }}
      >
        <View style={styles.signalHeader}>
          <Ionicons name={iconName as any} size={20} color={colors.text} />
          <Text style={styles.signalTitle}>{signal.title}</Text>
          {signalBadge(signal.priority)}
        </View>
        <Text style={styles.signalDescription}>{signal.description}</Text>
        <View style={styles.signalItems}>
          {signal.items.slice(0, 4).map((name, i) => (
            <View key={`${signal.id}-${i}`} style={styles.signalItemChip}>
              <Text style={styles.signalItemText}>{name}</Text>
            </View>
          ))}
          {signal.items.length > 4 && (
            <Text style={styles.signalMore}>+{signal.items.length - 4} more</Text>
          )}
        </View>
        {signal.actionLabel && (
          <TouchableOpacity style={styles.signalAction} activeOpacity={0.7}>
            <Text style={styles.signalActionText}>{signal.actionLabel} →</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  // --- Opportunity card ---
  function renderOpportunity(opp: KitchenOpportunity) {
    const isExpanded = expandedOpportunity === opp.id;
    return (
      <TouchableOpacity
        key={opp.id}
        style={styles.oppCard}
        activeOpacity={0.8}
        onPress={() => setExpandedOpportunity(isExpanded ? null : opp.id)}
      >
        <View style={styles.oppHeader}>
          <Text style={styles.oppName}>{opp.name}</Text>
          {effortBadge(opp.effort)}
        </View>
        <Text style={styles.oppDescription}>{opp.description}</Text>
        <Text style={styles.oppWhy}>{opp.whyGood}</Text>
        {isExpanded && (
          <View style={styles.oppDetail}>
            <Text style={styles.oppIngredients}>
              {opp.ingredients.join(', ')}
            </Text>
            <Text style={styles.oppTime}>~{opp.estimatedMinutes} min</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // --- Make mode (What can I make?) ---
  function renderMakeMode() {
    return (
      <View style={styles.makeSection}>
        <View style={styles.makeHeader}>
          <Ionicons name="bulb" size={20} color={colors.text} />
          <Text style={styles.makeTitle}>What can I make?</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setShowMakeMode(false);
              setMakeIdeas([]);
            }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {makeBusy ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : makeIdeas.length === 0 ? (
          <Text style={styles.makeEmpty}>
            Add some ingredients to your kitchen and I'll suggest what to make.
          </Text>
        ) : (
          makeIdeas.map((idea, idx) => (
            <TouchableOpacity
              key={`${idea.name}-${idx}`}
              style={styles.makeCard}
              activeOpacity={0.8}
              onPress={() => setMakeExpandedIdx(makeExpandedIdx === idx ? null : idx)}
            >
              <View style={styles.makeCardHeader}>
                <Text style={styles.makeCardName}>{idea.name}</Text>
                <View style={styles.makeCardMeta}>
                  {effortBadge(idea.effort)}
                  <Text style={styles.makeCardTime}>~{idea.estimatedMinutes} min</Text>
                </View>
              </View>
              <Text style={styles.makeCardDesc}>{idea.description}</Text>
              {makeExpandedIdx === idx && (
                <View style={styles.makeCardDetail}>
                  <Text style={styles.makeCardLabel}>Uses:</Text>
                  <Text style={styles.makeCardIngredients}>
                    {idea.ingredients.join(', ')}
                  </Text>
                  {idea.missingEssentials.length > 0 && (
                    <>
                      <Text style={styles.makeCardLabel}>You might need:</Text>
                      <Text style={styles.makeCardIngredients}>
                        {idea.missingEssentials.join(', ')}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  }

  // --- Loading state ---
  if (busy && !dashboard) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your kitchen…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Explore view ---
  function renderExplore() {
    if (!dashboard) return null;
    const { signals, opportunities, stats, items } = dashboard;
    const hasContent = signals.length > 0 || opportunities.length > 0 || items.length > 0;

    return (
      <ScrollView contentContainerStyle={styles.exploreContent}>
        <ErrorBanner error={error} />

        {/* Stats bar */}
        {stats.totalItems > 0 && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalItems}</Text>
              <Text style={styles.statLabel}>Items</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, stats.expiringCount > 0 && { color: colors.error }]}>
                {stats.expiringCount}
              </Text>
              <Text style={styles.statLabel}>Expiring</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.freshCount}</Text>
              <Text style={styles.statLabel}>Fresh</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.leftoverCount}</Text>
              <Text style={styles.statLabel}>Leftovers</Text>
            </View>
          </View>
        )}

        {/* What can I make? button */}
        {items.length > 0 && (
          <TouchableOpacity
            style={styles.makeButton}
            activeOpacity={0.8}
            onPress={() => void handleWhatCanIMake()}
          >
            <Ionicons name="bulb" size={20} color={colors.surface} />
            <Text style={styles.makeButtonText}>What can I make?</Text>
          </TouchableOpacity>
        )}

        {showMakeMode && renderMakeMode()}

        {/* Signals */}
        {signals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kitchen Signals</Text>
            {signals.map(renderSignal)}
          </View>
        )}

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kitchen Opportunities</Text>
            {opportunities.map(renderOpportunity)}
          </View>
        )}

        {/* Empty state */}
        {!hasContent && (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Your kitchen is quiet</Text>
            <Text style={styles.emptySubtitle}>
              Add ingredients and I'll help you make the most of what you have.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // --- Manage view ---
  function renderManage() {
    if (!dashboard) return null;
    const { items } = dashboard;
    const activeItems = items.filter((i) => i.state !== 'gone');

    return (
      <View style={styles.manageContent}>
        <ErrorBanner error={error} />

        {/* Add item form */}
        {showAdd && (
          <View style={styles.addForm}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Add to Kitchen</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setShowAdd(false);
                  setNewName('');
                  setNewQty('');
                  setNewUnit('');
                }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
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
            <PrimaryButton
              label="Add to kitchen"
              onPress={() => void handleAddItem()}
              busy={busy}
              disabled={!newName.trim()}
            />
          </View>
        )}

        {/* Items list */}
        {activeItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap + to add items or use the camera to identify food.
            </Text>
          </View>
        ) : (
          <FlatList
            data={activeItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[typography.heading, styles.title]}>Kitchen</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.cameraButton}
            activeOpacity={0.8}
            onPress={() => void handleCameraPick('camera')}
            disabled={identifyBusy}
          >
            {identifyBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="camera" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cameraButton}
            activeOpacity={0.8}
            onPress={() => void handleCameraPick('library')}
            disabled={identifyBusy}
          >
            <Ionicons name="images" size={20} color={colors.primary} />
          </TouchableOpacity>
          {view === 'manage' && (
            <TouchableOpacity
              style={styles.addButton}
              activeOpacity={0.8}
              onPress={() => setShowAdd(true)}
            >
              <Ionicons name="add" size={20} color={colors.surface} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Explore / Manage toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleButton, view === 'explore' && styles.toggleActive]}
          activeOpacity={0.8}
          onPress={() => setView('explore')}
        >
          <Text
            style={[styles.toggleText, view === 'explore' && styles.toggleTextActive]}
          >
            Explore
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, view === 'manage' && styles.toggleActive]}
          activeOpacity={0.8}
          onPress={() => setView('manage')}
        >
          <Text
            style={[styles.toggleText, view === 'manage' && styles.toggleTextActive]}
          >
            Manage
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {view === 'explore' ? renderExplore() : renderManage()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    marginBottom: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cameraButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.surface,
    fontWeight: '600',
    fontSize: 14,
  },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.text,
  },
  exploreContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  manageContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  // Stats
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // What can I make button
  makeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  makeButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  // Sections
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // Signals
  signalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  signalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  signalBadge: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  signalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.surface,
    textTransform: 'uppercase',
  },
  signalDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  signalItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  signalItemChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  signalItemText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  signalMore: {
    fontSize: 12,
    color: colors.textSecondary,
    alignSelf: 'center',
  },
  signalAction: {
    marginTop: spacing.sm,
  },
  signalActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  // Opportunities
  oppCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  oppHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  oppName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  effortBadge: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  effortBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.surface,
    textTransform: 'uppercase',
  },
  oppDescription: {
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  oppWhy: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  oppDetail: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  oppIngredients: {
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  oppTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  // Make mode
  makeSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  makeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  makeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  makeEmpty: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  makeCard: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  makeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  makeCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  makeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  makeCardTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  makeCardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  makeCardDetail: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  makeCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  makeCardIngredients: {
    fontSize: 13,
    color: colors.text,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  // Add form
  addForm: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
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
  // List
  listContent: {
    paddingBottom: spacing.xl,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  itemQty: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stateBadge: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  stateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemHint: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  expiryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.error + '10',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  expiryWarningText: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '600',
  },
});
