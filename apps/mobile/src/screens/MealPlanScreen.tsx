import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { Pressable } from '../components/motion/Pressable';
import type { HomeStackParamList } from '../navigation/AppNavigator';
import { useCommonTableStore } from '../stores/common-table.store';
import { useMealMemoryStore } from '../stores/meal-memory.store';
import { colors, fonts, spacing, typography } from '../theme';

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_ORDER: MealSlot[] = ['breakfast', 'snack', 'lunch', 'dinner'];

/** Bounds for the month header: no wrap-around — stop at -24/+12 months. */
const MIN_MONTH_DELTA = -24;
const MAX_MONTH_DELTA = 12;

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

function ymKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function addMonthsYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const daysCount = new Date(Date.UTC(y ?? 2000, (m ?? 1), 0)).getUTCDate();
  return Array.from({ length: daysCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return `${ym}-${day}`;
  });
}

function monthDeltaBetween(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** First Monday inside the month, so a loaded week always sits in that month. */
function firstMondayInMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const dow = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, 1)).getUTCDay();
  const day = 1 + ((8 - dow) % 7);
  return `${ym}-${String(day).padStart(2, '0')}`;
}

function prettyMonth(ym: string): string {
  return new Date(`${ym}-01T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

/**
 * A single day cell in the month strip. Memoized so busy/save-status/typing
 * re-renders don't rebuild all ~31 cells; each cell only re-renders when its
 * own props change, while the shared scrollX Animated value keeps the
 * distance-based scale/opacity running on the UI thread.
 */
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<string>);

/**
 * A single day cell in the month strip. Memoized so busy/save-status/typing
 * re-renders don't rebuild all ~31 cells; each cell only re-renders when its
 * own props change, while the shared scrollX Animated value keeps the
 * distance-based scale/opacity running on the UI thread.
 */
const DayCell = React.memo(function DayCell({
  dateKey,
  index,
  weekday,
  dayNum,
  isToday,
  isSelected,
  hasMeals,
  cellW,
  scrollX,
  onPress,
}: {
  dateKey: string;
  index: number;
  weekday: string;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  hasMeals: boolean;
  cellW: number;
  scrollX: Animated.Value;
  onPress: (index: number, key: string) => void;
}) {
  const offsetFromCenter = Animated.subtract(scrollX, index * cellW);
  const scale = offsetFromCenter.interpolate({
    inputRange: [-2.5 * cellW, -cellW, -cellW / 2, 0, cellW / 2, cellW, 2.5 * cellW],
    outputRange: [0.55, 0.72, 0.9, 1, 0.9, 0.72, 0.55],
    extrapolate: 'clamp',
  });
  const opacity = offsetFromCenter.interpolate({
    inputRange: [-2.5 * cellW, -cellW, -cellW / 2, 0, cellW / 2, cellW, 2.5 * cellW],
    outputRange: [0.25, 0.42, 0.72, 1, 0.72, 0.42, 0.25],
    extrapolate: 'clamp',
  });
  return (
    <Pressable
      style={styles.dayItem}
      scaleTo={0.94}
      onPress={() => onPress(index, dateKey)}
      accessibilityLabel={`${weekday} ${dayNum}`}
    >
      <Animated.View style={{ width: cellW, opacity, transform: [{ scale }] }}>
        <Text style={[styles.dayWeekday, isToday && styles.dayWeekdayToday]}>
          {weekday}
        </Text>
        <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
          {dayNum}
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
      </Animated.View>
    </Pressable>
  );
});

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
  const dayScrollRef = useRef<FlatList<string>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [stripWidth, setStripWidth] = useState(0);

  const currentYM = ymKey(today);
  const [viewedYM, setViewedYM] = useState<string>(() =>
    weekStart ? ymKey(weekStart) : currentYM,
  );
  const monthDelta = monthDeltaBetween(currentYM, viewedYM);
  const cellW = stripWidth > 0 ? Math.floor(stripWidth / 7) : 0;

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
  const requestedYMRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!weekStart) return;
    const wkYM = ymKey(weekStart);
    const requested = requestedYMRef.current;
    if (requested && requested !== wkYM) return;
    requestedYMRef.current = null;
    setViewedYM(wkYM);
  }, [weekStart]);

  const monthDays = useMemo(() => {
    return daysInMonth(viewedYM);
  }, [viewedYM]);

  const weekDaySet = useMemo(() => {
    if (!weekStart) return new Set<string>();
    return new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  }, [weekStart]);

  const focusedDayIndex = useMemo(() => {
    if (!focusedKey) return 0;
    const idx = monthDays.indexOf(focusedKey);
    return idx >= 0 ? idx : 0;
  }, [focusedKey, monthDays]);

  const selectedDay = useMemo(
    () => week?.days.find((day) => day.dateKey === focusedKey) ?? null,
    [week, focusedKey],
  );

  useEffect(() => {
    if (cellW > 0 && dayScrollRef.current && monthDays.length > 0) {
      dayScrollRef.current.scrollToOffset({ offset: focusedDayIndex * cellW, animated: true });
    }
  }, [focusedDayIndex, cellW, monthDays]);

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

  const handleDayMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const x = e.nativeEvent.contentOffset.x;
      if (cellW <= 0) return;
      const rawIndex = Math.round(x / cellW);
      if (rawIndex < 0 || rawIndex >= monthDays.length) return;
      const newKey = monthDays[rawIndex];
      if (newKey && newKey !== focusedKey) {
        setFocusedKey(newKey);
        setExpanded(null);
        if (!weekDaySet.has(newKey)) {
          const dayDate = new Date(`${newKey}T00:00:00.000Z`);
          const dow = dayDate.getUTCDay();
          const mondayOffset = dow === 0 ? -6 : 1 - dow;
          void loadWeek(addDays(newKey, mondayOffset));
        }
      }
    },
    [cellW, monthDays, focusedKey, weekDaySet, loadWeek],
  );

  const handleDayTap = useCallback(
    (index: number, key: string) => {
      setFocusedKey(key);
      setExpanded(null);
      dayScrollRef.current?.scrollToOffset({ offset: index * cellW, animated: true });
      if (!weekDaySet.has(key)) {
        const dayDate = new Date(`${key}T00:00:00.000Z`);
        const dow = dayDate.getUTCDay();
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        void loadWeek(addDays(key, mondayOffset));
      }
    },
    [cellW, weekDaySet, loadWeek],
  );

  function goToMonth(delta: number) {
    const targetYM = addMonthsYM(currentYM, delta);
    requestedYMRef.current = targetYM;
    setViewedYM(targetYM);
    setExpanded(null);
    const days = daysInMonth(targetYM);
    const focusTarget = days.includes(today) ? today : days[Math.floor(days.length / 2)];
    if (focusTarget) setFocusedKey(focusTarget);
    void loadWeek(firstMondayInMonth(targetYM));
  }

  if (!weekStart) {
    if (error && !busy) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
          <Text style={[typography.heading, styles.title, { fontFamily: fonts.display }]}>Meal Plan</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.container}>
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

          {/* Month centered above the day strip */}
          <View style={styles.monthAboveStrip}>
            <Pressable
              style={[
                styles.monthArrow,
                monthDelta <= MIN_MONTH_DELTA && styles.monthArrowDisabled,
              ]}
              onPress={() => goToMonth(monthDelta - 1)}
              disabled={monthDelta <= MIN_MONTH_DELTA}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={[styles.monthTitle, { fontFamily: fonts.display }]}>{prettyMonth(viewedYM)}</Text>
            <Pressable
              style={[
                styles.monthArrow,
                monthDelta >= MAX_MONTH_DELTA && styles.monthArrowDisabled,
              ]}
              onPress={() => goToMonth(monthDelta + 1)}
              disabled={monthDelta >= MAX_MONTH_DELTA}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>

          {/* Day strip — 7 per line, static center, the centered day is selected */}
          <View
            style={styles.dayStripWrap}
            onLayout={(e) => setStripWidth(Math.round(e.nativeEvent.layout.width))}
          >
            <View
              pointerEvents="none"
              style={[styles.dayCenterMarker, { left: (stripWidth - cellW) / 2, width: cellW }]}
            />
            {cellW > 0 && (
              <View style={styles.dayStripFade}>
                <AnimatedFlatList
                  ref={dayScrollRef}
                  horizontal
                  data={monthDays}
                  keyExtractor={(item) => item}
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  bounces={false}
                  overScrollMode="never"
                  removeClippedSubviews
                  maxToRenderPerBatch={11}
                  windowSize={11}
                  getItemLayout={(_, index) => ({
                    length: cellW,
                    offset: cellW * index,
                    index,
                  })}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: true },
                  )}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={handleDayMomentumScrollEnd}
                  contentContainerStyle={{
                    paddingHorizontal: (stripWidth - cellW) / 2,
                  }}
                  renderItem={({ item: key, index }) => (
                    <DayCell
                      dateKey={key}
                      index={index}
                      weekday={localeWeekday(key)}
                      dayNum={dayNumber(key)}
                      isToday={key === today}
                      isSelected={key === focusedKey}
                      hasMeals={(plannedCountByDate[key] ?? 0) > 0}
                      cellW={cellW}
                      scrollX={scrollX}
                      onPress={handleDayTap}
                    />
                  )}
                />
              </View>
            )}
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
                      tintBorderRadius={8}
                      style={[
                        styles.slotRow,
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
                      <Text
                        style={[
                          styles.slotLabel,
                          isExpanded && styles.slotLabelSelected,
                          !meal && styles.slotLabelEmpty,
                        ]}
                      >
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
      </View>
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
  monthAboveStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  monthArrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: {
    opacity: 0.3,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
    textAlign: 'center',
    minWidth: 160,
  },
  dayStripWrap: {
    height: 112,
    justifyContent: 'center',
    marginBottom: spacing.md,
    marginHorizontal: -spacing.lg,
  },
  dayStripFade: {
    width: '100%',
  },
  dayCenterMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary + '22',
  },
  dayItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 6,
  },
  dayWeekday: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dayWeekdaySelected: {
    color: colors.primary,
  },
  dayWeekdayToday: {
    color: colors.primary,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 2,
    textAlign: 'center',
  },
  dayNumberSelected: {
    color: colors.primary,
  },
  dayNumberToday: {
    color: colors.primary,
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
  slotRowEmpty: {
    opacity: 0.45,
  },
  slotLabel: {
    width: 100,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    textAlign: 'center',
    overflow: 'hidden',
  },
  slotLabelSelected: {
    backgroundColor: colors.border,
    color: colors.text,
  },
  slotLabelEmpty: {
    color: colors.border,
    backgroundColor: colors.background,
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
