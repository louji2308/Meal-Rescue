import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MealEvent, MealMemoryIntentResponse, MealSlot } from '@meal-rescue/shared-types';

import { Text } from '../components/AppText';
import { TextInput } from '../components/AppTextInput';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { MealPlanLoading } from '../components/meal-plan';
import { FadeInView } from '../components/motion/FadeInView';
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { useCommonTableStore } from '../stores/common-table.store';
import { useMealMemoryStore } from '../stores/meal-memory.store';
import { colors, spacing, typography } from '../theme';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const DAY_ITEM_WIDTH = 56;
const MONTH_ITEM_WIDTH = 72;

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
  return new Date().toISOString().slice(0, 10);
}

function localeWeekday(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function getMountainStyle(distance: number) {
  if (distance === 0) return { scale: 1, opacity: 1, isCenter: true };
  if (distance === 1) return { scale: 0.82, opacity: 0.65, isCenter: false };
  if (distance === 2) return { scale: 0.68, opacity: 0.4, isCenter: false };
  return { scale: 0.55, opacity: 0.2, isCenter: false };
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

export function MealPlanScreen() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 14);
  const composerBottomPad = bottomInset + 86 - insets.bottom + spacing.sm;
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<{ dateKey: string; mealSlot: MealSlot } | null>(null);

  const week = useMealMemoryStore((s) => s.week);
  const weekStart = useMealMemoryStore((s) => s.weekStart);
  const pendingIntent = useMealMemoryStore((s) => s.pendingIntent);
  const lastMessage = useMealMemoryStore((s) => s.lastMessage);
  const busy = useMealMemoryStore((s) => s.busy);
  const error = useMealMemoryStore((s) => s.error);
  const saveStatus = useMealMemoryStore((s) => s.saveStatus);
  const [refreshing, setRefreshing] = useState(false);

  const loadWeek = useMealMemoryStore((s) => s.loadWeek);
  const loadRules = useMealMemoryStore((s) => s.loadRules);
  const shiftWeek = useMealMemoryStore((s) => s.shiftWeek);
  const sendIntent = useMealMemoryStore((s) => s.sendIntent);
  const answerIntent = useMealMemoryStore((s) => s.answerIntent);
  const moveEvent = useMealMemoryStore((s) => s.moveEvent);
  const removeEvent = useMealMemoryStore((s) => s.removeEvent);
  const markActual = useMealMemoryStore((s) => s.markActual);
  const feedBack = useMealMemoryStore((s) => s.feedBack);
  const loadRecents = useMealMemoryStore((s) => s.loadRecents);

  const selectedMemberIds = useCommonTableStore((s) => s.selectedMemberIds);
  const householdMembers = useCommonTableStore((s) => s.members);
  const ensureHousehold = useCommonTableStore((s) => s.ensureHousehold);

  const today = todayKey();
  const dayScrollRef = useRef<ScrollView>(null);
  const monthScrollRef = useRef<ScrollView>(null);

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

  useEffect(() => {
    if (!weekStart) return;
    if (!focusedKey || focusedKey < weekStart || focusedKey > addDays(weekStart, 6)) {
      setFocusedKey(today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart);
    }
  }, [weekStart]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const focusedDayIndex = useMemo(() => {
    if (!focusedKey || !weekStart) return 0;
    const idx = weekDays.indexOf(focusedKey);
    return idx >= 0 ? idx : 0;
  }, [focusedKey, weekDays, weekStart]);

  const selectedDay = useMemo(
    () => week?.days.find((day) => day.dateKey === focusedKey) ?? null,
    [week, focusedKey],
  );

  useEffect(() => {
    if (dayScrollRef.current && weekDays.length > 0) {
      const offset = focusedDayIndex * DAY_ITEM_WIDTH;
      dayScrollRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [focusedDayIndex, weekDays]);

  const months = useMemo(() => {
    if (!weekStart) return [];
    const result: { key: string; label: string; year: string; monthOffset: number }[] = [];
    const baseDate = new Date(`${weekStart}T00:00:00.000Z`);
    for (let i = -6; i <= 6; i++) {
      const d = new Date(baseDate);
      d.setUTCMonth(d.getUTCMonth() + i);
      const isoMonth = d.toISOString().slice(0, 7);
      result.push({
        key: isoMonth,
        label: d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }),
        year: d.getUTCFullYear().toString(),
        monthOffset: i,
      });
    }
    return result;
  }, [weekStart]);

  const selectedMonthIndex = useMemo(() => {
    if (!weekStart) return 6;
    const currentMonth = weekStart.slice(0, 7);
    const idx = months.findIndex((m) => m.key === currentMonth);
    return idx >= 0 ? idx : 6;
  }, [weekStart, months]);

  useEffect(() => {
    if (monthScrollRef.current && months.length > 0) {
      const offset = selectedMonthIndex * MONTH_ITEM_WIDTH;
      monthScrollRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [selectedMonthIndex, months]);

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
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
              Try again
            </Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <MealPlanLoading visible={true} />
      </SafeAreaView>
    );
  }

  const handleDayMomentumScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / DAY_ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(index, weekDays.length - 1));
    const newKey = weekDays[clamped];
    if (newKey && newKey !== focusedKey) {
      setFocusedKey(newKey);
      setExpanded(null);
    }
  };

  const handleMonthMomentumScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / MONTH_ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(index, months.length - 1));
    const selectedMonth = months[clamped];
    if (selectedMonth && selectedMonth.monthOffset !== 0) {
      void shiftWeek(selectedMonth.monthOffset * 4);
    }
  };

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
                  ? 'Saving…'
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

          {/* Month carousel */}
          <View style={styles.carouselWithArrows}>
            <Pressable
              style={styles.carouselArrow}
              onPress={() => void shiftWeek(-4)}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </Pressable>
            <View style={styles.carouselSection}>
              <ScrollView
                ref={monthScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={MONTH_ITEM_WIDTH}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMonthMomentumScrollEnd}
                contentContainerStyle={styles.carouselContent}
              >
                {months.map((month, index) => {
                  const distance = Math.abs(index - selectedMonthIndex);
                  const style = getMountainStyle(distance);
                  const isCurrentMonth = month.monthOffset === 0;
                  return (
                    <Pressable
                      key={month.key}
                      style={[
                        styles.monthItem,
                        {
                          width: MONTH_ITEM_WIDTH,
                          opacity: style.opacity,
                          transform: [{ scale: style.scale }],
                        },
                        isCurrentMonth && styles.monthItemSelected,
                      ]}
                      onPress={() => {
                        if (month.monthOffset !== 0) {
                          void shiftWeek(month.monthOffset * 4);
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.monthLabel,
                          isCurrentMonth && styles.monthLabelSelected,
                          { fontSize: isCurrentMonth ? 18 : 14 },
                        ]}
                      >
                        {month.label}
                      </Text>
                      <Text style={[styles.monthYear, isCurrentMonth && styles.monthYearSelected]}>
                        {month.year}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <Pressable
              style={styles.carouselArrow}
              onPress={() => void shiftWeek(4)}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Day carousel */}
          <View style={styles.carouselWithArrows}>
            <Pressable
              style={styles.carouselArrow}
              onPress={() => {
                if (focusedDayIndex > 0) {
                  setFocusedKey(weekDays[focusedDayIndex - 1]);
                  setExpanded(null);
                } else {
                  void shiftWeek(-1);
                }
              }}
              accessibilityLabel="Previous day"
            >
              <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            </Pressable>
            <View style={styles.carouselSection}>
              <ScrollView
                ref={dayScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={DAY_ITEM_WIDTH}
                decelerationRate="fast"
                onMomentumScrollEnd={handleDayMomentumScrollEnd}
                contentContainerStyle={styles.carouselContent}
              >
                {weekDays.map((key, index) => {
                  const distance = Math.abs(index - focusedDayIndex);
                  const style = getMountainStyle(distance);
                  const isToday = key === today;
                  const isSelected = key === focusedKey;
                  const hasMeals = (plannedCountByDate[key] ?? 0) > 0;
                  return (
                    <Pressable
                      key={key}
                      style={[
                        styles.dayItem,
                        {
                          width: DAY_ITEM_WIDTH,
                          opacity: style.opacity,
                          transform: [{ scale: style.scale }],
                        },
                        isSelected && styles.dayItemSelected,
                      ]}
                      onPress={() => {
                        setFocusedKey(key);
                        setExpanded(null);
                      }}
                      accessibilityLabel={`${localeWeekday(key)} ${dayNumber(key)}`}
                    >
                      <Text style={[styles.dayWeekday, isSelected && styles.dayWeekdaySelected]}>
                        {localeWeekday(key)}
                      </Text>
                      <Text
                        style={[
                          styles.dayNumber,
                          isSelected && styles.dayNumberSelected,
                          { fontSize: isSelected ? 26 : 16 },
                        ]}
                      >
                        {dayNumber(key)}
                      </Text>
                      <View style={styles.dayDotRow}>
                        <View
                          style={[
                            styles.dayDot,
                            isToday && styles.dotToday,
                            hasMeals && !isToday && styles.dotPlanned,
                            !isToday && !hasMeals && styles.dotEmpty,
                          ]}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <Pressable
              style={styles.carouselArrow}
              onPress={() => {
                if (focusedDayIndex < weekDays.length - 1) {
                  setFocusedKey(weekDays[focusedDayIndex + 1]);
                  setExpanded(null);
                } else {
                  void shiftWeek(1);
                }
              }}
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Week meta */}
          {scopeLabel && (
            <View style={styles.scopeRow}>
              <View style={styles.scopeChip}>
                <Ionicons name="person" size={11} color={colors.primary} />
                <Text style={styles.scopeChipText}>for {scopeLabel}</Text>
              </View>
            </View>
          )}

          {/* Selected day plan */}
          {selectedDay ? (
            <View style={styles.dayCard}>
              <Text style={styles.dayCardLabel}>{prettyDate(selectedDay.dateKey)}</Text>
              {SLOT_ORDER.map((slotKey) => {
                const slot = selectedDay.slots.find((s) => s.mealSlot === slotKey);
                const meal = slot?.planned ?? null;
                const isExpanded =
                  expanded?.dateKey === selectedDay.dateKey && expanded?.mealSlot === slotKey;
                return (
                  <View key={slotKey}>
                    <Pressable
                      style={[
                        styles.slotRow,
                        isExpanded && styles.slotRowSelected,
                        !meal && styles.slotRowEmpty,
                      ]}
                      onPress={() => {
                        if (!meal) return;
                        navigation.navigate('DishDetail', {
                          eventId: meal.id,
                          concept: meal.concept ?? '',
                          mealSlot: slotKey,
                          dateKey: selectedDay.dateKey,
                        });
                      }}
                      onLongPress={() => {
                        if (!meal) return;
                        setExpanded(
                          isExpanded ? null : { dateKey: selectedDay.dateKey, mealSlot: slotKey },
                        );
                      }}
                    >
                      <Text style={[styles.slotLabel, !meal && styles.slotLabelEmpty]}>
                        {SLOT_LABELS[slotKey]}
                      </Text>
                      {meal ? (
                        <View style={styles.slotMeal}>
                          <Text style={styles.slotConcept}>{meal.concept ?? 'Planned meal'}</Text>
                          <Text style={styles.slotMeta}>
                            {meal.mealRole?.replaceAll('_', ' ') ?? ''}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.slotOpen}>Nothing planned</Text>
                      )}
                      {meal && (
                        <Ionicons name="chevron-forward" size={16} color={colors.softAlert} />
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
                              void feedBack({ mealEventId: meal.id, rating: 'loved' }).catch(
                                () => {},
                              )
                            }
                          >
                            <Ionicons name="heart" size={14} color={colors.softAlert} />
                            <Text style={styles.slotActionText}>Loved</Text>
                          </Pressable>
                          <Pressable
                            style={styles.slotAction}
                            disabled={busy}
                            onPress={() =>
                              void moveEvent(
                                meal.id,
                                addDays(selectedDay.dateKey, 1),
                                slotKey,
                              ).catch(() => {})
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
                            <Text style={[styles.slotActionText, { color: colors.error }]}>
                              Remove
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

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
            <Ionicons name="checkmark-circle" size={16} color={colors.softAlert} />
            <Text style={styles.resultBannerText} numberOfLines={2}>
              {lastMessage}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.inputBar, { paddingBottom: composerBottomPad }]}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Help me to plan for tomorrow..."
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
                <Ionicons name="arrow-up" size={22} color={colors.surface} />
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
  weekContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  carouselWithArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  carouselArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselSection: {
    flex: 1,
  },
  carouselContent: {
    paddingHorizontal: spacing.xl,
  },
  monthItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  monthItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  monthLabel: {
    fontWeight: '700',
    color: colors.text,
  },
  monthLabelSelected: {
    fontWeight: '800',
    color: colors.text,
  },
  monthYear: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  monthYearSelected: {
    color: colors.text,
  },
  dayItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  dayItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  dayWeekday: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayWeekdaySelected: {
    color: colors.text,
  },
  dayNumber: {
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
  },
  dayNumberSelected: {
    color: colors.text,
  },
  dayDotRow: {
    height: 8,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotToday: {
    backgroundColor: colors.secondary,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotPlanned: {
    backgroundColor: colors.secondary,
    opacity: 0.5,
  },
  dotEmpty: {
    backgroundColor: colors.border,
    opacity: 0.4,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
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
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  dayCardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  slotRowSelected: {
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  slotRowEmpty: {
    opacity: 0.45,
  },
  slotLabel: {
    width: 88,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  slotLabelEmpty: {
    color: colors.border,
  },
  slotMeal: {
    flex: 1,
  },
  slotConcept: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  slotMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  slotOpen: {
    flex: 1,
    fontSize: 15,
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
    paddingTop: spacing.md,
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
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    maxHeight: 120,
    lineHeight: 22,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
