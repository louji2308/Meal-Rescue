import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../motion/Pressable';
import { Text } from '../AppText';
import { colors, spacing } from '../../theme';

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

const WEEKDAY_LETTERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface MealSlot {
  mealSlot: string;
  planned?: {
    id: string;
    concept?: string | null;
    mealRole?: string | null;
    state?: string | null;
  } | null;
}

interface DayData {
  dateKey: string;
  slots: MealSlot[];
}

interface WeeklyOverviewProps {
  days: DayData[];
  todayKey: string;
  focusedKey: string;
  onSelectDay: (dateKey: string) => void;
  onSelectMeal: (eventId: string, concept: string, mealSlot: string, dateKey: string) => void;
}

function dayNumber(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDate();
}

export default function WeeklyOverview({
  days,
  todayKey,
  focusedKey,
  onSelectDay,
  onSelectMeal,
}: WeeklyOverviewProps) {
  return (
    <View style={styles.container}>
      {days.map((day, index) => {
        const isToday = day.dateKey === todayKey;
        const isFocused = day.dateKey === focusedKey;
        const plannedCount = day.slots.filter((s) => s.planned).length;
        return (
          <View key={day.dateKey} style={styles.dayColumn}>
            <Pressable
              style={[styles.dayHeader, isFocused && styles.dayHeaderFocused]}
              onPress={() => onSelectDay(day.dateKey)}
            >
              <Text style={[styles.dayLetter, isFocused && styles.dayLetterFocused]}>
                {WEEKDAY_LETTERS[index]}
              </Text>
              <Text style={[styles.dayNumber, isFocused && styles.dayNumberFocused]}>
                {dayNumber(day.dateKey)}
              </Text>
              {isToday && <View style={styles.todayDot} />}
            </Pressable>
            <View style={styles.slotsList}>
              {SLOT_ORDER.map((slotKey) => {
                const slot = day.slots.find((s) => s.mealSlot === slotKey);
                const meal = slot?.planned ?? null;
                return (
                  <Pressable
                    key={slotKey}
                    style={[styles.slotItem, meal && styles.slotItemPlanned]}
                    onPress={() => {
                      if (meal) {
                        onSelectMeal(meal.id, meal.concept ?? '', slotKey, day.dateKey);
                      }
                    }}
                    disabled={!meal}
                  >
                    {meal ? (
                      <Ionicons
                        name={
                          meal.state === 'EATEN'
                            ? 'checkmark-circle'
                            : meal.state === 'REPLACED'
                              ? 'swap-horizontal'
                              : 'restaurant'
                        }
                        size={10}
                        color={colors.primary}
                      />
                    ) : (
                      <View style={styles.emptyDot} />
                    )}
                    <Text
                      style={[styles.slotText, meal && styles.slotTextPlanned]}
                      numberOfLines={1}
                    >
                      {meal?.concept ?? SLOT_LABELS[slotKey]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.planCount}>
              {plannedCount > 0 ? `${plannedCount}/4` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginBottom: spacing.xs,
    minWidth: 40,
  },
  dayHeaderFocused: {
    backgroundColor: colors.primaryLight,
  },
  dayLetter: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  dayLetterFocused: {
    color: colors.text,
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    marginTop: 1,
  },
  dayNumberFocused: {
    color: colors.text,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
  slotsList: {
    gap: 3,
    width: '100%',
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  slotItemPlanned: {
    backgroundColor: colors.primaryLight + '80',
  },
  slotText: {
    fontSize: 8,
    color: colors.textSecondary,
    flex: 1,
  },
  slotTextPlanned: {
    color: colors.text,
    fontWeight: '600',
  },
  emptyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  planCount: {
    fontSize: 8,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
});
