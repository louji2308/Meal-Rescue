import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  nextWeekStartFor,
  previousWeekStartFor,
  resolveDateReference,
  weekDays,
  weekStartFor,
} from '../../src/services/meal-memory/date-utils';

describe('date-utils', () => {
  const MONDAY = '2026-09-07'; // a known Monday

  it('computes the Monday of a week containing any day', () => {
    expect(weekStartFor(MONDAY)).toBe(MONDAY);
    expect(weekStartFor('2026-09-10')).toBe(MONDAY);
    expect(weekStartFor('2026-09-13')).toBe(MONDAY);
  });

  it('navigates to previous and next week starts', () => {
    expect(previousWeekStartFor(MONDAY)).toBe('2026-08-31');
    expect(nextWeekStartFor(MONDAY)).toBe('2026-09-14');
  });

  it('enumerates the seven days of a week', () => {
    expect(weekDays(MONDAY)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-09-30', 2)).toBe('2026-10-02');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('resolves casual references relative to today', () => {
    const today = '2026-09-10';
    expect(resolveDateReference('tonight', today)).toBe(today);
    expect(resolveDateReference('today', today)).toBe(today);
    expect(resolveDateReference('tomorrow', today)).toBe('2026-09-11');
    // next occurrence, strictly in the future
    expect(resolveDateReference('friday', today)).toBe('2026-09-11');
    // monday is later in the week (today is Thursday)
    expect(resolveDateReference('monday', today)).toBe('2026-09-14');
    expect(resolveDateReference('2026-10-01', today)).toBe('2026-10-01');
  });

  it('resolves week-level refs to Monday anchors', () => {
    const today = '2026-09-10';
    expect(resolveDateReference('this week', today)).toBe(MONDAY);
    expect(resolveDateReference('next week', today)).toBe('2026-09-14');
  });
});
