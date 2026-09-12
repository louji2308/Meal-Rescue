/**
 * Meal Memory date utilities — calendar math for weekly planning.
 * All "day" values are naive calendar day keys (YYYY-MM-DD) computed in the
 * household's local timeline; the agent treats them as timezone-independent
 * buckets for planning purposes.
 */

/** Local YYYY-MM-DD key. offset is the user's tzOffsetMinutes. */
export function dateKeyFor(date: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `dateKey` (YYYY-MM-DD). */
export function weekStartFor(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const dow = (date.getUTCDay() + 6) % 7; // 0 = Monday
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - dow);
  return start.toISOString().slice(0, 10);
}

/** Monday of the week BEFORE the week containing `dateKey`. */
export function previousWeekStartFor(dateKey: string): string {
  const start = weekStartFor(dateKey);
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

/** Monday of the week AFTER the week containing `dateKey`. */
export function nextWeekStartFor(dateKey: string): string {
  const start = weekStartFor(dateKey);
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const DAY_NAME_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/** The 7 date keys of the week starting at `weekStart`. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Resolve a casual time reference ("tonight", "tomorrow", "friday", a named
 * day of week, or an ISO key) to a date key relative to `todayKey`.
 * Returns null when the reference is not a time reference.
 */
export function resolveDateReference(raw: string, todayKey: string): string | null {
  const text = raw.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const today = new Date(`${todayKey}T00:00:00.000Z`);
  if (text === 'today' || text === 'tonight') return todayKey;
  if (text === 'tomorrow') return addDays(todayKey, 1);
  if (text === 'this week') return weekStartFor(todayKey);
  if (text === 'next week') return nextWeekStartFor(todayKey);

  const dayName = DAY_NAMES.find((name) => text.includes(name));
  if (dayName) {
    const targetIndex = DAY_NAME_INDEX[dayName]!;
    const dow = (today.getUTCDay() + 6) % 7;
    let delta = targetIndex - dow;
    if (delta <= 0) delta += 7; // next occurrence, strictly in the future
    return addDays(todayKey, delta);
  }

  if (/^this weekend$/.test(text)) {
    const start = weekStartFor(todayKey);
    return addDays(start, 5); // Saturday
  }

  return null;
}

/** True when `dateKey` falls inside the week starting at `weekStart`. */
export function inWeek(dateKey: string, weekStart: string): boolean {
  return dateKey >= weekStart && dateKey <= addDays(weekStart, 6);
}
