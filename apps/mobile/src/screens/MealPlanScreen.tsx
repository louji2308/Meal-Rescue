import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MealMemoryIntentResponse, MealRule, MealSlot } from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, typography } from '../theme';
import { useMealMemoryStore } from '../stores/meal-memory.store';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const WEEKDAY_LETTERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STRATEGY_OPTIONS: { key: 'balance' | 'easy' | 'use_expiring'; label: string }[] = [
  { key: 'balance', label: 'Balanced' },
  { key: 'easy', label: 'Easy' },
  { key: 'use_expiring', label: 'Use expiry' },
];

const SUGGESTIONS: { label: string; prompt?: string; plan?: boolean }[] = [
  { plan: true, label: 'Plan this week' },
  { label: 'Plan next week', prompt: 'plan next week' },
  { label: "What's for dinner?", prompt: 'what are we doing for dinner?' },
  { label: "We're out Tuesday", prompt: "we're out next tuesday" },
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

function ruleIcon(rule: MealRule): keyof typeof Ionicons.glyphMap {
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

function ruleLabel(rule: MealRule): string {
  if (rule.ingredient) return `no ${rule.ingredient}`;
  if (rule.mealSlot) return `keep ${rule.mealSlot} open`;
  if (rule.note) return rule.note;
  return 'active rule';
}

/**
 * Meal Plan — one screen, no sub-tabs. Week-strip calendar on top, a focused
 * day's four slots below, a read-only rules strip, and a pinned command bar
 * so the agent is always a tap away. Rules are managed by talking.
 */
export function MealPlanScreen() {
  const [strategy, setStrategy] = useState<'balance' | 'easy' | 'use_expiring'>('balance');
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ dateKey: string; mealSlot: MealSlot } | null>(null);

  const week = useMealMemoryStore((s) => s.week);
  const weekStart = useMealMemoryStore((s) => s.weekStart);
  const pendingIntent = useMealMemoryStore((s) => s.pendingIntent);
  const rules = useMealMemoryStore((s) => s.rules);
  const lastMessage = useMealMemoryStore((s) => s.lastMessage);
  const busy = useMealMemoryStore((s) => s.busy);
  const error = useMealMemoryStore((s) => s.error);

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

  const today = todayKey();

  useEffect(() => {
    if (!weekStart) void loadWeek();
    void loadRules();
  }, [loadWeek, loadRules, weekStart]);

  // Focus today when it falls inside the loaded week, otherwise the week start.
  useEffect(() => {
    if (!weekStart) return;
    if (!focusedKey || focusedKey < weekStart || focusedKey > addDays(weekStart, 6)) {
      setFocusedKey(today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart);
    }
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    if (!weekStart) return '';
    return `${prettyDate(weekStart)} – ${prettyDate(addDays(weekStart, 6))}`;
  }, [weekStart]);

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

  function handleSuggestion(action: (typeof SUGGESTIONS)[number]) {
    if (action.plan) {
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
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={[typography.heading, styles.title]}>Meal Plan</Text>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your food week…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[typography.heading, styles.title]}>Meal Plan</Text>
        {busy && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      <ScrollView
        contentContainerStyle={styles.weekContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ErrorBanner error={error} />

        {/* Week-strip calendar */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={styles.weekNavButton}
            activeOpacity={0.8}
            onPress={() => void shiftWeek(-1)}
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={18} color={colors.softViolet} />
          </TouchableOpacity>

          <View style={styles.calendarStrip}>
            {weekDays.map((key) => {
              const index = weekDays.indexOf(key);
              const selected = key === focusedKey;
              const isToday = key === today;
              const hasMeals = (plannedCountByDate[key] ?? 0) > 0;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                  activeOpacity={0.8}
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
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.weekNavButton}
            activeOpacity={0.8}
            onPress={() => void shiftWeek(1)}
            accessibilityLabel="Next week"
          >
            <Ionicons name="chevron-forward" size={18} color={colors.softViolet} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekMetaRow}>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          {today < weekStart || today > addDays(weekStart, 6) ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => void loadWeek()}
              style={styles.todayLink}
            >
              <Text style={styles.todayLinkText}>‹ today ›</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Toolbar */}
        <View style={styles.toolbarRow}>
          <View style={styles.strategyRow}>
            {STRATEGY_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.strategyChip, strategy === s.key && styles.strategyChipActive]}
                activeOpacity={0.8}
                onPress={() => setStrategy((cur) => (cur === s.key ? 'balance' : s.key))}
              >
                <Text style={[styles.strategyText, strategy === s.key && styles.strategyTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton
            label="Plan this week"
            onPress={() => void planThisWeek({ strategy }).catch(() => {})}
            busy={busy}
            style={styles.planButton}
          />
        </View>

        {/* Suggestion chips */}
        <View style={styles.quickRow}>
          {SUGGESTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.quickChip}
              activeOpacity={0.8}
              onPress={() => handleSuggestion(action)}
            >
              <Text style={styles.quickChipText}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Rules strip — read-only, managed by talking */}
        {rules.length > 0 && (
          <View style={styles.rulesStrip}>
            {rules.slice(0, 6).map((rule) => (
              <View key={rule.id} style={styles.ruleChip}>
                <Ionicons name={ruleIcon(rule)} size={12} color={colors.softCyan} />
                <Text style={styles.ruleChipText} numberOfLines={1}>
                  {ruleLabel(rule)}
                </Text>
              </View>
            ))}
          </View>
        )}

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
                  <TouchableOpacity
                    style={[styles.slotRow, isExpanded && styles.slotRowSelected]}
                    activeOpacity={0.8}
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
                      <Ionicons name="chevron-down" size={16} color={colors.softViolet} />
                    )}
                  </TouchableOpacity>

                  {isExpanded && meal && (
                    <View style={styles.slotActions}>
                      <TouchableOpacity
                        style={styles.slotAction}
                        activeOpacity={0.7}
                        onPress={() =>
                          void markActual({
                            dateKey: selectedDay.dateKey,
                            mealSlot: slotKey,
                            ate: true,
                            concept: meal.concept ?? undefined,
                          }).catch(() => {})
                        }
                      >
                        <Ionicons name="checkmark" size={14} color={colors.softGreen} />
                        <Text style={styles.slotActionText}>Cooked it</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.slotAction}
                        activeOpacity={0.7}
                        onPress={() =>
                          void markActual({
                            dateKey: selectedDay.dateKey,
                            mealSlot: slotKey,
                            skipped: true,
                          }).catch(() => {})
                        }
                      >
                        <Ionicons name="close" size={14} color={colors.softRed} />
                        <Text style={styles.slotActionText}>Skipped</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.slotAction}
                        activeOpacity={0.7}
                        onPress={() =>
                          void feedBack({ mealEventId: meal.id, rating: 'loved' }).catch(() => {})
                        }
                      >
                        <Ionicons name="heart" size={14} color={colors.softPink} />
                        <Text style={styles.slotActionText}>Loved</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.slotAction}
                        activeOpacity={0.7}
                        onPress={() =>
                          void moveEvent(meal.id, addDays(selectedDay.dateKey, 1), slotKey).catch(
                            () => {},
                          )
                        }
                      >
                        <Ionicons name="arrow-forward" size={14} color={colors.softViolet} />
                        <Text style={styles.slotActionText}>Tomorrow</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.slotAction, styles.slotActionDanger]}
                        activeOpacity={0.7}
                        onPress={() => void removeEvent(meal.id).catch(() => {})}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.softRed} />
                        <Text style={[styles.slotActionText, { color: colors.error }]}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {week && week.days.every((day) => day.slots.every((slot) => !slot.planned)) && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={colors.softPurple} />
            <Text style={styles.emptyTitle}>No plan yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap “Plan this week” or tell me below what you feel like eating.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Result / answer banner sits above the command bar */}
      {needsAnswer && pendingIntent && (
        <View style={styles.agentCard}>
          <View style={styles.agentHeader}>
            <Ionicons name="chatbubble-ellipses" size={16} color={colors.softCyan} />
            <Text style={styles.agentStatus}>{statusLabel(pendingIntent)}</Text>
          </View>
          <Text style={styles.agentBody}>{intentBody(pendingIntent)}</Text>
          <View style={styles.answerRow}>
            <TextInput
              style={styles.answerInput}
              placeholder="Type yes, no, or a fix…"
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
          <Ionicons name="checkmark-circle" size={16} color={colors.softGreen} />
          <Text style={styles.resultBannerText} numberOfLines={2}>
            {lastMessage}
          </Text>
        </View>
      )}

      {/* Pinned command bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inputBar}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Tell me about your food week…"
            placeholderTextColor={colors.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void handleSend()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
            style={styles.sendButton}
            activeOpacity={0.8}
            onPress={() => void handleSend()}
            disabled={!input.trim()}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.surface} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.surface} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
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
  weekContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayLetter: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayLetterSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 1,
  },
  dayNumberSelected: {
    color: colors.surface,
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
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  strategyText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  strategyTextActive: {
    color: colors.surface,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  ruleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: 180,
  },
  ruleChipText: {
    fontSize: 12,
    color: colors.secondary,
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
    color: colors.primary,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});