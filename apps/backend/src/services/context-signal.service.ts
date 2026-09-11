import type { UUID } from '@meal-rescue/shared-types';

type TimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'late_night';
type Season = 'spring' | 'summer' | 'fall' | 'winter';

interface ContextSignals {
  timeOfDay: TimeOfDay;
  season: Season;
  dayOfWeek: string;
  isWeekend: boolean;
  hour: number;
}

interface ContextPreference {
  ingredient: string;
  contextType: string;
  contextValue: string;
  preference: 'love' | 'like' | 'neutral' | 'dislike' | 'hate';
  strength: number;
}

/**
 * ContextSignalService - captures and uses contextual signals.
 *
 * Uses time of day, season, and day of week to influence recommendations.
 * "Hot soup in winter" vs "cold salad in summer".
 */
export class ContextSignalService {
  /**
   * Get current context signals from a timestamp.
   */
  static getCurrentContext(date?: Date): ContextSignals {
    const now = date ?? new Date();
    const hour = now.getHours();
    const month = now.getMonth();
    const day = now.getDay();

    return {
      timeOfDay: ContextSignalService.getTimeOfDay(hour),
      season: ContextSignalService.getSeason(month),
      dayOfWeek: (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[day] as string,
      isWeekend: day === 0 || day === 6,
      hour,
    };
  }

  /**
   * Check if an ingredient fits the current context.
   */
  fitsContext(
    ingredient: string,
    context: ContextSignals,
    userPrefs: ContextPreference[],
  ): number {
    const relevantPrefs = userPrefs.filter((p) => {
      if (p.contextType === 'meal_time') return p.contextValue === context.timeOfDay;
      if (p.contextType === 'season') return p.contextValue === context.season;
      return false;
    });

    if (relevantPrefs.length === 0) return 0.5; // No data, neutral

    const positive = relevantPrefs.filter((p) => p.preference === 'love' || p.preference === 'like');
    const negative = relevantPrefs.filter((p) => p.preference === 'dislike' || p.preference === 'hate');

    const positiveScore = positive.reduce((sum, p) => sum + p.strength, 0) / positive.length || 0;
    const negativeScore = negative.reduce((sum, p) => sum + p.strength, 0) / negative.length || 0;

    return Math.max(0, Math.min(1, 0.5 + positiveScore - negativeScore));
  }

  /**
   * Get time-of-appropriate suggestions for a context.
   */
  getTimeAppropriateSuggestions(context: ContextSignals): string[] {
    const suggestions: Record<TimeOfDay, string[]> = {
      morning: ['egg', 'oatmeal', 'yogurt', 'fruit', 'toast', 'cereal'],
      lunch: ['sandwich', 'salad', 'soup', 'rice', 'pasta'],
      afternoon: ['snack', 'fruit', 'nuts', 'cheese'],
      dinner: ['chicken', 'beef', 'fish', 'vegetables', 'rice', 'pasta'],
      late_night: ['light_snack', 'leftovers', 'simple_meal'],
    };

    return suggestions[context.timeOfDay] ?? suggestions.dinner;
  }

  private static getTimeOfDay(hour: number): TimeOfDay {
    if (hour >= 5 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'dinner';
    return 'late_night';
  }

  private static getSeason(month: number): Season {
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }
}
