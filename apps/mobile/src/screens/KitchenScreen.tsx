import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
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
  getKitchenDashboard,
  identifyKitchenFood,
  whatCanIMake,
  upsertKitchenItem,
  deleteKitchenItem,
  markKitchenItemUsed,
} from '../services/kitchen.api';
import { colors, spacing, typography } from '../theme';

type ViewMode = 'explore' | 'manage';
type AddKind = 'pantry' | 'leftover';

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

  // Horizontal pager (Explore = page 0, Manage = page 1)
  const pagerRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(() => Dimensions.get('window').width);

  // Camera
  const [identifyBusy, setIdentifyBusy] = useState(false);

  // Add form (bottom sheet)
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('pantry');
  const [newName, setNewName] = useState('');
  const [newDish, setNewDish] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newServings, setNewServings] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newMade, setNewMade] = useState('');
  const [newExpiry, setNewExpiry] = useState('');

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

  // --- Pager helpers ---
  const goToPage = (page: number) => {
    setView(page === 0 ? 'explore' : 'manage');
    pagerRef.current?.scrollTo({ x: page * pageWidth, animated: true });
  };

  const onPagerScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setView(page >= 1 ? 'manage' : 'explore');
  };

  // --- Relative date parser ("today", "yesterday", "in 2 days", "3 days ago") ---
  function parseRelativeDate(input: string): Date | null {
    const lower = input.toLowerCase().trim();
    if (!lower) return null;
    if (lower === 'today') return new Date();
    if (lower === 'tomorrow' || lower === 'tmr') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (lower === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    }
    const inDays = lower.match(/^in\s+(\d+)\s+days?$/);
    if (inDays) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(inDays[1], 10));
      return d;
    }
    const daysAgo = lower.match(/^(\d+)\s+days?\s+ago$/);
    if (daysAgo) {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(daysAgo[1], 10));
      return d;
    }
    const daysAhead = lower.match(/^(\d+)\s+days?$/);
    if (daysAhead) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(daysAhead[1], 10));
      return d;
    }
    const iso = lower.match(/^\d{4}-\d{2}-\d{2}$/);
    if (iso) {
      const d = new Date(`${lower}T12:00:00`);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function resetAddForm() {
    setAddKind('pantry');
    setNewName('');
    setNewDish('');
    setNewQty('');
    setNewUnit('');
    setNewServings('');
    setNewNotes('');
    setNewMade('');
    setNewExpiry('');
  }

  function openAddForm() {
    resetAddForm();
    setShowAdd(true);
  }

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

  // --- Add item / leftover manually ---
  async function handleAddItem() {
    const isLeftover = addKind === 'leftover';
    const name = (isLeftover ? newDish : newName).trim();
    if (!name) return;
    setBusy(true);
    try {
      const expiryDate = newExpiry.trim() ? parseRelativeDate(newExpiry) : null;
      const common = {
        ingredientName: name,
        quantity: newQty ? Number(newQty) : undefined,
        unit: newUnit.trim() || undefined,
        expiresAt: expiryDate ? expiryDate.toISOString() : undefined,
      };
      if (isLeftover) {
        const madeAt = newMade.trim() ? parseRelativeDate(newMade) : new Date();
        await upsertKitchenItem({
          ...common,
          kind: 'leftover',
          dishName: name,
          servings: newServings ? Number(newServings) : undefined,
          notes: newNotes.trim() || undefined,
          madeAt: madeAt ? madeAt.toISOString() : undefined,
        });
      } else {
        await upsertKitchenItem(common);
      }
      setShowAdd(false);
      resetAddForm();
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

  // --- Leftover card ---
  function renderLeftover({ item }: { item: KitchenItem }) {
    return (
      <TouchableOpacity
        style={[styles.itemCard, styles.leftoverCard]}
        activeOpacity={0.7}
        onPress={() => handleMarkUsed(item)}
        onLongPress={() => handleDeleteItem(item)}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemNameRow}>
            <View style={[styles.stateDot, { backgroundColor: STATE_COLORS.leftover }]} />
            <Text style={styles.itemName}>{item.dishName ?? item.ingredientName}</Text>
          </View>
          {item.servings !== null && item.servings !== undefined && (
            <Text style={styles.itemQty}>
              {item.servings} serving{item.servings === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        <View style={styles.itemMeta}>
          <View style={[styles.stateBadge, { backgroundColor: STATE_COLORS.leftover + '20' }]}>
            <Text style={[styles.stateText, { color: STATE_COLORS.leftover }]}>Leftover</Text>
          </View>
          <Text style={styles.itemHint}>{item.stateReason}</Text>
        </View>
        {item.notes ? <Text style={styles.leftoverNotes}>{item.notes}</Text> : null}
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

  // --- Add bottom sheet ---
  function renderAddSheet() {
    const isLeftover = addKind === 'leftover';
    return (
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.sheetScrim}
            activeOpacity={1}
            onPress={() => setShowAdd(false)}
          />
          <View style={styles.sheet}>
            <SafeAreaView edges={['bottom']} style={styles.sheetSafe}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Add to Kitchen</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowAdd(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close form"
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Kind toggle */}
              <View style={styles.kindToggle}>
                {(['pantry', 'leftover'] as AddKind[]).map((kind) => (
                  <TouchableOpacity
                    key={kind}
                    style={[styles.kindButton, addKind === kind && styles.kindButtonActive]}
                    activeOpacity={0.8}
                    onPress={() => setAddKind(kind)}
                  >
                    <Text
                      style={[styles.kindText, addKind === kind && styles.kindTextActive]}
                    >
                      {kind === 'pantry' ? 'Pantry item' : 'Leftover dish'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {isLeftover ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Dish name (Chicken Biryani)"
                    placeholderTextColor={colors.textSecondary}
                    value={newDish}
                    onChangeText={setNewDish}
                    autoFocus
                  />
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.qtyInput}
                      placeholder="Portions"
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
                    placeholder="Servings remaining"
                    placeholderTextColor={colors.textSecondary}
                    value={newServings}
                    onChangeText={setNewServings}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={newNotes}
                    onChangeText={setNewNotes}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Made when? (today, yesterday)"
                    placeholderTextColor={colors.textSecondary}
                    value={newMade}
                    onChangeText={setNewMade}
                  />
                </>
              ) : (
                <>
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
                </>
              )}
              <TextInput
                style={styles.input}
                placeholder="Expires (tomorrow, in 3 days)"
                placeholderTextColor={colors.textSecondary}
                value={newExpiry}
                onChangeText={setNewExpiry}
              />
              <PrimaryButton
                label={isLeftover ? 'Add leftover' : 'Add to kitchen'}
                onPress={() => void handleAddItem()}
                busy={busy}
                disabled={!((isLeftover ? newDish : newName).trim())}
                style={styles.sheetAction}
              />
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    const leftovers = items.filter((i) => i.kind === 'leftover');
    const activeItems = items.filter((i) => i.kind !== 'leftover' && i.state !== 'gone');
    const hasAnything = leftovers.length > 0 || activeItems.length > 0;

    return (
      <ScrollView
        style={styles.manageContent}
        contentContainerStyle={styles.manageScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ErrorBanner error={error} />

        {/* Leftovers section */}
        {leftovers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Leftovers</Text>
            <View style={styles.list}>
              {leftovers.map((item) => (
                <React.Fragment key={item.id}>{renderLeftover({ item })}</React.Fragment>
              ))}
            </View>
            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>In your kitchen</Text>
          </>
        )}

        {/* Pantry items */}
        {!hasAnything ? (
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap + to add ingredients or snap a photo to identify food.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {activeItems.map((item) => (
              <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
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
        </View>
      </View>

      {/* Explore / Manage tabs */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleButton, view === 'explore' && styles.toggleActive]}
          activeOpacity={0.8}
          onPress={() => goToPage(0)}
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
          onPress={() => goToPage(1)}
        >
          <Text
            style={[styles.toggleText, view === 'manage' && styles.toggleTextActive]}
          >
            Manage
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
        onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={onPagerScrollEnd}
      >
        <View style={{ width: pageWidth }}>{renderExplore()}</View>
        <View style={{ width: pageWidth }}>{renderManage()}</View>
      </ScrollView>

      {/* Floating add button */}
      {view === 'manage' && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={openAddForm}
          accessibilityRole="button"
          accessibilityLabel="Add to kitchen"
        >
          <Ionicons name="add" size={30} color={colors.surface} />
        </TouchableOpacity>
      )}

      {/* Add bottom sheet */}
      {renderAddSheet()}
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
  pager: {
    flex: 1,
  },
  exploreContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  manageContent: {
    flex: 1,
  },
  manageScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
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
  // Floating action button
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
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
  sectionTitleSpaced: {
    marginTop: spacing.lg,
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
  // Bottom sheet
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheetSafe: {
    paddingBottom: spacing.lg,
  },
  sheetAction: {
    marginTop: spacing.xs,
  },
  // Add form
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
  kindToggle: {
    flexDirection: 'row',
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 3,
    marginBottom: spacing.md,
  },
  kindButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  kindButtonActive: {
    backgroundColor: colors.surface,
  },
  kindText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  kindTextActive: {
    color: colors.text,
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
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  leftoverCard: {
    borderLeftWidth: 4,
    borderLeftColor: STATE_COLORS.leftover,
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
    flexShrink: 1,
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
  leftoverNotes: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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