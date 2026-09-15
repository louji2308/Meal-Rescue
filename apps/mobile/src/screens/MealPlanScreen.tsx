import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Pressable } from '../components/motion/Pressable';
import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  MealEvent,
  MealMemoryIntentResponse,
  MealRule,
  MealSlot,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Skeleton } from '../components/Skeleton';
import { FadeInView } from '../components/motion/FadeInView';
import { colors, radius, spacing, typography } from '../theme';
import { useMealMemoryStore } from '../stores/meal-memory.store';
import { useCommonTableStore } from '../stores/common-table.store';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const WEEKDAY_LETTERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const _STRATEGY_OPTIONS: { key: 'balance' | 'easy' | 'use_expiring'; label: string }[] = [
  { key: 'balance', label: 'Balanced' },
  { key: 'easy', label: 'Easy' },
  { key: 'use_expiring', label: 'Use expiry' },
];

const SUGGESTIONS: { label: string; prompt?: string; plan?: boolean; reuse?: boolean }[] = [
  { plan: true, label: 'Plan this week' },
  { label: 'Plan next week', prompt: 'plan next week' },
  { label: "What's for dinner?", prompt: 'what are we doing for dinner?' },
  { label: "We're out Tuesday", prompt: "we're out next tuesday" },
  { reuse: true, label: 'Reuse last week' },
];

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayNumber(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDate();
}

function todayKey(): string {
  // Backend calendar backbone is UTC-based, so match it exactly.
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(intent: MealMemoryIntentResponse | null): string {
  if (!intent) return '';
  switch (intent.status) {
    case 'actioned':
      return 'Done';
    case 'awaiting_confirmation':
      return 'Needs a yes or no';
    case 'clarification':
      return 'One more detail';
    default:
      return 'How can I help?';
  }
}

function intentBody(intent: MealMemoryIntentResponse | null): string {
  if (!intent) return '';
  if (intent.clarification) return intent.clarification.question;
  if (intent.result && intent.result.message) return intent.result.message;
  return intent.resolution.rawText;
}

function _ruleIcon(rule: MealRule): keyof typeof Ionicons.glyphMap {
  if (rule.instructionType === 'BLOCK_SLOT' || rule.instructionType === 'KEEP_OUT') {
    return 'close-circle-outline';
  }
  if (rule.instructionType === 'HOLD_INGREDIENT' || rule.instructionType === 'RESERVE_INGREDIENT') {
    return 'lock-closed-outline';
  }
  if (rule.instructionType === 'KEEP_OPEN') {
    return 'hand-left-outline';
  }
  return 'document-text-outline';
}

function _ruleLabel(rule: MealRule): string {
  if (rule.ingredient) return `no ${rule.ingredient}`;
  if (rule.mealSlot) return `keep ${rule.mealSlot} open`;
  if (rule.note) return rule.note;
  return 'active rule';
}

function _ruleDetail(rule: MealRule): string {
  const parts: string[] = [];
  if (rule.ingredient) parts.push(`No ${rule.ingredient}`);
  if (rule.mealSlot) parts.push(`Keep ${SLOT_LABELS[rule.mealSlot]} open`);
  if (rule.note) parts.push(rule.note);
  if (parts.length === 0) {
    parts.push(rule.instructionType.toLowerCase().replaceAll('_', ' '));
  }
  return parts.join(' � ');
}

/**
 * Inline renaming of a planned meal's concept. Every change flows through the
 * store's debounced autosave so typing stays local-first and a failed save
 * rolls the grid back instead of leaving wrong text on screen.
 */
function SlotConceptEditor({ meal }: { meal: MealEvent }) {
  const autosaveUpdateEvent = useMealMemoryStore((s) => s.autosaveUpdateEvent);
  const [value, setValue] = useState(meal.concept ?? '');
  return (
    <View style={styles.conceptEditor}>
      <Text style={styles.conceptEditorLabel}>Concept</Text>
      <TextInput
        style={styles.conceptInput}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          autosaveUpdateEvent(meal.id, { concept: text });
        }}
        placeholder="e.g. Butter chicken"
        placeholderTextColor={colors.textSecondary}
        autoCorrect={false}
      />
    </View>
  );
}

/**
 * Meal Plan � one screen, no sub-tabs. Week-strip calendar on top, a focused
 * day's four slots below, a read-only rules strip, and a pinned command bar
 * so the agent is always a tap away. Rules are managed by talking.
 */
export function MealPlanScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 14);
  const composerBottomPad = bottomInset + 86 - insets.bottom + spacing.sm;
  const [strategy, _setStrategy] = useState<'balance' | 'easy' | 'use_expiring'>('balance');
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ dateKey: string; mealSlot: MealSlot } | null>(null);
  const [_expandedRuleId, _setExpandedRuleId] = useState<string | null>(null);

  const week = useMealMemoryStore((s) => s.week);
  const weekStart = useMealMemoryStore((s) => s.weekStart);
  const pendingIntent = useMealMemoryStore((s) => s.pendingIntent);
  const _rules = useMealMemoryStore((s) => s.rules);
  const lastMessage = useMealMemoryStore((s) => s.lastMessage);
const busy = useMealMemoryStore((s) => s.busy);
  const error = useMealMemoryStore((s) => s.error);
  const saveStatus = useMealMemoryStore((s) => s.saveStatus);
  const _recentMeals = useMealMemoryStore((s) => s.recentMeals);
  const [refreshing, setRefreshing] = useState(false);

  const loadWeek = useMealMemoryStore((s) => s.loadWeek);
  const loadRules = useMealMemoryStore((s) => s.loadRules);
  const shiftWeek = useMealMemoryStore((s) => s.shiftWeek);
  const sendIntent = useMealMemoryStore((s) => s.sendIntent);
  const answerIntent = useMealMemoryStore((s) => s.answerIntent);
  const planThisWeek = useMealMemoryStore((s) => s.planThisWeek);
  const moveEvent = useMealMemoryStore((s) => s.moveEvent);
  const removeEvent = useMealMemoryStore((s) => s.removeEvent);
  const markActual = useMealMemoryStore((s) => s.markActual);
  const feedBack = useMealMemoryStore((s) => s.feedBack);
  const reuseLastWeek = useMealMemoryStore((s) => s.reuseLastWeek);
  const loadRecents = useMealMemoryStore((s) => s.loadRecents);
  const _deactivateRule = useMealMemoryStore((s) => s.deactivateRule);

const selectedMemberIds = useCommonTableStore((s) => s.selectedMemberIds);
  const householdMembers = useCommonTableStore((s) => s.members);
  const ensureHousehold = useCommonTableStore((s) => s.ensureHousehold);

  const today = todayKey();

  const scopeLabel = useMemo(() => {
    if (selectedMemberIds.length !== 1) return null;
    const id = selectedMemberIds[0];
    return householdMembers.find((m) => m.id === id)?.displayName ?? null;
  }, [selectedMemberIds, householdMembers]);

useEffect(() => {
    ensureHousehold()
      .then(() => {
        if (!weekStart) void loadWeek();
        void loadRules();
        void loadRecents();
      })
      .catch(() => {
        if (!weekStart) void loadWeek();
        void loadRules();
        void loadRecents();
      });
  }, [ensureHousehold, loadWeek, loadRules, loadRecents, weekStart]);

  const lastLoadedAt = useRef(0);
  const sawWeek = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (sawWeek.current && Date.now() - lastLoadedAt.current > 30_000) {
        void loadWeek();
      }
    }, [loadWeek]),
  );
  useEffect(() => {
    if (weekStart && !busy) {
      lastLoadedAt.current = Date.now();
      sawWeek.current = true;
    }
  }, [weekStart, busy]);

  // Focus today when it falls inside the loaded week, otherwise the week start.
  useEffect(() => {
    if (!weekStart) return;
    if (!focusedKey || focusedKey < weekStart || focusedKey > addDays(weekStart, 6)) {
      setFocusedKey(today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart);
    }
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    if (!weekStart) return '';
    return `${prettyDate(weekStart)} � ${prettyDate(addDays(weekStart, 6))}`;
  }, [weekStart]);

  const monthLabel = useMemo(() => {
    if (!weekStart) return '';
    const d = new Date(`${weekStart}T00:00:00.000Z`);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [weekStart]);

  const isPastWeek = useMemo(() => {
    if (!weekStart) return false;
    return weekStart < today;
  }, [weekStart, today]);

  const reviewDays = useMemo(() => {
    if (!week || !isPastWeek) return [];
    return week.days.map((day) => {
      const eaten = day.slots.some((s) => s.planned?.state === 'EATEN');
      const replaced = day.slots.some((s) => s.planned?.state === 'REPLACED');
      const planned = day.slots.some((s) => s.planned != null);
      const firstConcept = day.slots.find((s) => s.planned)?.planned?.concept ?? null;
      return { dateKey: day.dateKey, eaten, replaced, planned, firstConcept };
    });
  }, [week, isPastWeek]);

  const selectedDay = useMemo(
    () => week?.days.find((day) => day.dateKey === focusedKey) ?? null,
    [week, focusedKey],
  );

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      await sendIntent(text);
    } catch {
      // error surfaces via the banner
    }
  }

  async function handleConfirm() {
    if (!pendingIntent || !answer.trim()) return;
    try {
      await answerIntent(pendingIntent.intentId, answer.trim());
      setAnswer('');
    } catch {
      // error banner
    }
  }

  function _handleSuggestion(action: (typeof SUGGESTIONS)[number]) {
    if (action.reuse) {
      void reuseLastWeek().catch(() => {});
    } else if (action.plan) {
      void planThisWeek({ strategy }).catch(() => {});
    } else if (action.prompt) {
      void sendIntent(action.prompt).catch(() => {});
    }
  }

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const plannedCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of week?.days ?? []) {
      counts[day.dateKey] = day.slots.filter((s) => s.planned).length;
    }
    return counts;
  }, [week]);

  const needsAnswer =
    pendingIntent &&
    (pendingIntent.status === 'awaiting_confirmation' || pendingIntent.status === 'clarification');

if (!weekStart) {
    if (error && !busy) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={[typography.heading, styles.title]}>Meal Plan</Text>
          </View>
          <ErrorBanner error={error} />
          <Pressable
            onPress={() => {
              ensureHousehold()
                .then(() => loadWeek())
                .catch(() => loadWeek());
            }}
            style={{ marginTop: spacing.md, alignItems: 'center' }}
          >
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.loadingScroll}>
          <Skeleton height={24} width="45%" style={{ marginBottom: spacing.xs }} />
          <Skeleton height={14} width="30%" style={{ marginBottom: spacing.lg }} />
          <Skeleton height={64} borderRadius={radius.md} />
          <Skeleton lines={3} height={52} borderRadius={12} style={{ marginTop: spacing.lg }} />
          <Skeleton lines={3} height={52} borderRadius={12} style={{ marginTop: spacing.lg }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

return (
    <SafeAreaView style={styles.container}>
      <FadeInView style={styles.container}>
      <View style={styles.header}>
        <Text style={[typography.heading, styles.title]}>Meal Plan</Text>
        <View style={styles.headerRight}>
          {saveStatus !== 'idle' && (
            <Text
              style={[styles.saveBadge, saveStatus === 'error' && styles.saveBadgeError]}
              accessibilityLabel={`Meal plan save status: ${saveStatus}`}
            >
              {saveStatus === 'saving'
                ? 'Saving�'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : 'Not saved'}
            </Text>
          )}
          {busy && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.weekContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadWeek().finally(() => setRefreshing(false));
            }}
            tintColor={colors.textSecondary}
          />
        }
      >
        <ErrorBanner error={error} />

        {/* Month header */}
        {monthLabel ? (
          <View style={styles.monthHeader}>
            <Pressable
              style={styles.monthNavButton}
              onPress={() => void shiftWeek(-4)}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.monthHeaderText}>{monthLabel}</Text>
            <Pressable
              style={styles.monthNavButton}
              onPress={() => void shiftWeek(4)}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {/* Week-strip calendar */}
        <View style={styles.calendarHeader}>
          <Pressable
            style={styles.weekNavButton}
            onPress={() => void shiftWeek(-1)}
            accessibilityLabel="Previous week"
          >
<Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.calendarStrip}>
            {weekDays.map((key) => {
              const index = weekDays.indexOf(key);
              const selected = key === focusedKey;
              const isToday = key === today;
              const hasMeals = (plannedCountByDate[key] ?? 0) > 0;
              return (
                <Pressable
                  key={key}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                  onPress={() => {
                    setFocusedKey(key);
                    setExpanded(null);
                  }}
                  accessibilityLabel={`${WEEKDAY_LETTERS[index]} ${dayNumber(key)}`}
                >
                  <Text
                    style={[styles.dayLetter, selected && styles.dayLetterSelected]}
                  >
                    {WEEKDAY_LETTERS[index]}
                  </Text>
                  <Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>
                    {dayNumber(key)}
                  </Text>
                  <View style={styles.dayDotRow}>
                    {isToday ? (
                      <View style={[styles.dayDot, styles.dotToday]} />
                    ) : hasMeals ? (
                      <View style={styles.dayDot} />
                    ) : (
                      <View style={styles.dotBlank} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.weekNavButton}
            onPress={() => void shiftWeek(1)}
            accessibilityLabel="Next week"
          >
<Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.weekMetaRow}>
          <View style={styles.weekMetaLeft}>
            {scopeLabel && (
              <View style={styles.scopeChip}>
                <Ionicons name="person" size={11} color={colors.primary} />
                <Text style={styles.scopeChipText}>for {scopeLabel}</Text>
              </View>
            )}
            <Text style={styles.weekLabel}>{weekLabel}</Text>
          </View>
          {today < weekStart || today > addDays(weekStart, 6) ? (
            <Pressable
              onPress={() => void loadWeek()}
              style={styles.todayLink}
            >
              <Text style={styles.todayLinkText}>� today �</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Past week summary */}
        {isPastWeek && reviewDays.length > 0 ? null : null}

        {/* Plan this week button */}
        <View style={styles.toolbarRow}>
          <PrimaryButton
            label="Plan this week"
            onPress={() => void planThisWeek({ strategy }).catch(() => {})}
            busy={busy}
            style={styles.planButton}
          />
        </View>

        {/* Focused day */}
        {selectedDay ? (
          <View style={styles.dayCard}>
            <Text style={styles.dayLabel}>{prettyDate(selectedDay.dateKey)}</Text>
            {SLOT_ORDER.map((slotKey) => {
              const slot = selectedDay.slots.find((s) => s.mealSlot === slotKey);
              const meal = slot?.planned ?? null;
              const isExpanded =
                expanded?.dateKey === selectedDay.dateKey && expanded?.mealSlot === slotKey;
              return (
                <View key={slotKey}>
                  <Pressable
                    style={[styles.slotRow, isExpanded && styles.slotRowSelected]}
                    onPress={() => {
                      if (!meal) return;
                      setExpanded(isExpanded ? null : { dateKey: selectedDay.dateKey, mealSlot: slotKey });
                    }}
                  >
                    <Text style={styles.slotLabel}>{SLOT_LABELS[slotKey]}</Text>
                    {meal ? (
                      <View style={styles.slotMeal}>
                        <Text style={styles.slotConcept}>{meal.concept ?? 'Planned meal'}</Text>
                        <Text style={styles.slotMeta}>
                          {meal.mealRole?.replaceAll('_', ' ') ?? ''}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.slotOpen}>Open</Text>
                    )}
                    {meal && (
                      <Ionicons name="chevron-down" size={16} color={colors.softAlert} />
                    )}
                  </Pressable>

                  {isExpanded && meal && (
                    <>
                      <SlotConceptEditor key={meal.id} meal={meal} />
                      <View style={styles.slotActions}>
                        <Pressable
                          style={styles.slotAction}
                          disabled={busy}
                          onPress={() =>
                            void markActual({
                              dateKey: selectedDay.dateKey,
                              mealSlot: slotKey,
                              ate: true,
                              concept: meal.concept ?? undefined,
                            }).catch(() => {})
                          }
                        >
                          <Ionicons name="checkmark" size={14} color={colors.softAlert} />
                          <Text style={styles.slotActionText}>Cooked it</Text>
                        </Pressable>
                        <Pressable
                          style={styles.slotAction}
                          disabled={busy}
                          onPress={() =>
                            void markActual({
                              dateKey: selectedDay.dateKey,
                              mealSlot: slotKey,
                              skipped: true,
                            }).catch(() => {})
                          }
                        >
                          <Ionicons name="close" size={14} color={colors.softAlert} />
                          <Text style={styles.slotActionText}>Skipped</Text>
                        </Pressable>
                        <Pressable
                          style={styles.slotAction}
                          disabled={busy}
                          onPress={() =>
                            void feedBack({ mealEventId: meal.id, rating: 'loved' }).catch(() => {})
                          }
                        >
                          <Ionicons name="heart" size={14} color={colors.softAlert} />
                          <Text style={styles.slotActionText}>Loved</Text>
                        </Pressable>
                        <Pressable
                          style={styles.slotAction}
                          disabled={busy}
                          onPress={() =>
                            void moveEvent(meal.id, addDays(selectedDay.dateKey, 1), slotKey).catch(
                              () => {},
                            )
                          }
                        >
                          <Ionicons name="arrow-forward" size={14} color={colors.softAlert} />
                          <Text style={styles.slotActionText}>Tomorrow</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.slotAction, styles.slotActionDanger]}
                          disabled={busy}
                          onPress={() => void removeEvent(meal.id).catch(() => {})}
                        >
                          <Ionicons name="trash-outline" size={14} color={colors.softAlert} />
                          <Text style={[styles.slotActionText, { color: colors.error }]}>Remove</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {week && week.days.every((day) => day.slots.every((slot) => !slot.planned)) && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={colors.softAlert} />
            <Text style={styles.emptyTitle}>No plan yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap �Plan this week� or tell me below what you feel like eating.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Result / answer banner sits above the command bar */}
      {needsAnswer && pendingIntent && (
        <View style={styles.agentCard}>
          <View style={styles.agentHeader}>
            <Ionicons name="chatbubble-ellipses" size={16} color={colors.softAlert} />
            <Text style={styles.agentStatus}>{statusLabel(pendingIntent)}</Text>
          </View>
          <Text style={styles.agentBody}>{intentBody(pendingIntent)}</Text>
          <View style={styles.answerRow}>
            <TextInput
              style={styles.answerInput}
              placeholder="Type yes, no, or a fix�"
              placeholderTextColor={colors.textSecondary}
              value={answer}
              onChangeText={setAnswer}
              onSubmitEditing={() => void handleConfirm()}
              returnKeyType="send"
            />
            <PrimaryButton
              label="Send"
              onPress={() => void handleConfirm()}
              busy={busy}
              disabled={!answer.trim()}
              style={styles.answerButton}
            />
          </View>
        </View>
      )}

      {lastMessage && !pendingIntent && (
        <View style={styles.resultBanner}>
          <Ionicons name="checkmark-circle" size={16} color={colors.softAlert} />
          <Text style={styles.resultBannerText} numberOfLines={2}>
            {lastMessage}
          </Text>
        </View>
      )}

{/* Pinned command bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.inputBar, { paddingBottom: composerBottomPad }]}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your meals…"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void handleSend()}
            returnKeyType="send"
            multiline
          />
          <Pressable
            style={styles.sendButton}
            onPress={() => void handleSend()}
            disabled={!input.trim()}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.surface} />
            )}
</Pressable>
        </View>
      </KeyboardAvoidingView>
      </FadeInView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingScroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    marginBottom: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saveBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },
  saveBadgeError: {
    color: colors.error,
  },
  weekMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
scopeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  recentStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success + '10',
    borderWidth: 1,
    borderColor: colors.success + '30',
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: 180,
  },
  recentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  ruleGroup: {
    marginBottom: spacing.xs,
  },
  weekContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
weekNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarStrip: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
dayCellSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  dayLetter: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
dayLetterSelected: {
    color: colors.text,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 1,
  },
dayNumberSelected: {
    color: colors.text,
  },
  dayDotRow: {
    height: 6,
    marginTop: 2,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  dotToday: {
    backgroundColor: colors.primary,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotBlank: {
    width: 5,
    height: 5,
  },
  weekMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  weekLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  todayLink: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
  },
  todayLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  toolbarRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  strategyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  strategyChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
strategyChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.borderStrong,
  },
  strategyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
strategyTextActive: {
    color: colors.text,
  },
  planButton: {},
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  rulesStrip: {
    flexDirection: 'column',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  ruleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 240,
  },
  ruleChipText: {
    fontSize: 12,
    color: colors.secondary,
  },
  ruleDetail: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    marginLeft: spacing.sm,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
    gap: spacing.xs,
  },
  ruleDetailText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  ruleRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  ruleRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  conceptEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  conceptEditorLabel: {
    width: 84,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  conceptInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 15,
    color: colors.text,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  slotRowSelected: {
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  slotLabel: {
    width: 84,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  slotMeal: {
    flex: 1,
  },
  slotConcept: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  slotMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  slotOpen: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  slotActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  slotAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  slotActionDanger: {
    backgroundColor: colors.error + '10',
  },
  slotActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl,
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
  agentCard: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
agentStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agentBody: {
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  answerInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  answerButton: {
    paddingVertical: spacing.sm + 2,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success + '10',
    borderTopWidth: 1,
    borderTopColor: colors.success + '30',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resultBannerText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    maxHeight: 110,
  },
sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
monthNavButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthHeaderText: {
    ...typography.subhead,
    color: colors.text,
    textAlign: 'center',
  },
  reviewSection: {
    marginBottom: spacing.md,
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  reviewRow: {
    gap: spacing.xs,
  },
  reviewCard: {
    width: 64,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  reviewDayName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  reviewConcept: {
    fontSize: 10,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
    height: 28,
  },
  reviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
