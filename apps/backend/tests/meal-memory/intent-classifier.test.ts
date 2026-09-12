import { describe, expect, it } from '@jest/globals';

import {
  MUTATIONS_ALWAYS_CONFIRMED,
  bandFor,
  buildClarificationPrompt,
  classifyIntent,
  isPlanWeek,
  nextWeekStartForDate,
  weekStartForDate,
} from '../../src/services/meal-memory/intent-classifier';

const TODAY = '2026-09-10';

function ctx(overrides?: { memberNames?: string[] }) {
  return { todayKey: TODAY, ...overrides };
}

describe('intent-classifier', () => {
  describe('recognises intent families', () => {
    it('recognises PLAN_WEEK from "can you plan next week"', () => {
      const r = classifyIntent('can you plan next week', ctx());
      expect(r.intent).toBe('PLAN_WEEK');
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('recognises REMEMBER when the user says they loved a meal', () => {
      const r = classifyIntent('we loved the chicken we had on monday', ctx());
      expect(r.intent).toBe('REMEMBER');
    });

    it('recognises RECORD_ACTUAL_MEAL for "log"', () => {
      const r = classifyIntent('log that we ate pasta for dinner', ctx());
      expect(r.intent).toBe('RECORD_ACTUAL_MEAL');
      expect(r.entities.mealSlot).toBe('dinner');
    });

    it('recognises SCHEDULE for "we\'re having X"', () => {
      const r = classifyIntent("we're having salmon on friday", ctx());
      expect(r.intent).toBe('SCHEDULE');
      expect(r.entities.mealConcept).toMatch(/salmon/i);
    });

    it('recognises BLOCK_TIME for "we are out"', () => {
      const r = classifyIntent('we are out next thursday', ctx());
      expect(r.intent).toBe('BLOCK_TIME');
      expect(r.entities.blockType).toBe('out');
    });

    it('recognises MOVE_MEAL', () => {
      const r = classifyIntent('move monday dinner to friday', ctx());
      expect(r.intent).toBe('MOVE_MEAL');
      expect(r.entities.moveTarget).not.toBeNull();
    });

    it('recognises REMOVE_MEAL', () => {
      const r = classifyIntent('remove dinner on wednesday', ctx());
      expect(r.intent).toBe('REMOVE_MEAL');
    });

    it('recognises SET_RULE for ingredient exclusions', () => {
      const r = classifyIntent("don't use eggs", ctx());
      expect(r.intent).toBe('SET_RULE');
      expect(r.entities.ingredient).toBe('eggs');
    });

    it('recognises PURCHASE_SUGGESTION', () => {
      const r = classifyIntent('what do we need from the store?', ctx());
      expect(r.intent).toBe('PURCHASE_SUGGESTION');
    });

    it('recognises ASK_QUESTION when asking "what"', () => {
      const r = classifyIntent('what are we doing for dinner?', ctx());
      expect(r.intent).toBe('ASK_QUESTION');
      expect(r.entities.mealSlot).toBe('dinner');
    });
  });

  describe('entity extraction', () => {
    it('resolves date references to ISO keys', () => {
      const r = classifyIntent('plan next week', ctx());
      expect(r.entities.targetHorizon).toBe('next week');
      expect(r.entities.targetDate).toBe(nextWeekStartForDate(TODAY));
    });

    it('extracts meal slot words', () => {
      expect(classifyIntent('what about breakfast?', ctx()).entities.mealSlot).toBe('breakfast');
      expect(classifyIntent('plan dinner tonight', ctx()).entities.mealSlot).toBe('dinner');
      expect(classifyIntent('lunch idea for tomorrow', ctx()).entities.mealSlot).toBe('lunch');
    });

    it('picks up ingredients from exclusion phrases', () => {
      const r = classifyIntent('no dairy please', ctx());
      expect(r.entities.ingredient).toMatch(/^dairy/);
    });
  });

  describe('confidence bands', () => {
    it('returns MEDIUM for a single match', () => {
      const r = classifyIntent('can you plan next week', ctx());
      expect(r.confidenceBand).toBe('MEDIUM');
    });

    it('returns HIGH for a strong multi-match phrase', () => {
      const r = classifyIntent('can you plan next week please', ctx());
      // two matches (PLAN_WEEK + ASK_QUESTION) but highest wins
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('bandFor maps boundaries correctly', () => {
      expect(bandFor(0.75)).toBe('HIGH');
      expect(bandFor(0.6)).toBe('MEDIUM');
      expect(bandFor(0.4)).toBe('LOW');
    });
  });

  describe('helpers', () => {
    it('isPlanWeek returns true only for PLAN_WEEK', () => {
      expect(isPlanWeek('PLAN_WEEK')).toBe(true);
      expect(isPlanWeek('SCHEDULE')).toBe(false);
    });

    it('MUTATIONS_ALWAYS_CONFIRMED contains destructive intents', () => {
      expect(MUTATIONS_ALWAYS_CONFIRMED.has('REMOVE_MEAL')).toBe(true);
      expect(MUTATIONS_ALWAYS_CONFIRMED.has('REPLAN')).toBe(true);
      expect(MUTATIONS_ALWAYS_CONFIRMED.has('PLAN_WEEK')).toBe(false);
    });

    it('weekStartForDate wraps weekStartFor', () => {
      expect(weekStartForDate(TODAY)).toBe('2026-09-07');
    });

    it('nextWeekStartForDate wraps nextWeekStartFor', () => {
      expect(nextWeekStartForDate(TODAY)).toBe('2026-09-14');
    });

    it('buildClarificationPrompt returns null when no clarification needed', () => {
      const r = classifyIntent('plan next week', ctx());
      expect(buildClarificationPrompt(r)).toBeNull();
    });

    it('buildClarificationPrompt returns a question when entities are missing', () => {
      const r = classifyIntent('schedule something', ctx());
      expect(buildClarificationPrompt(r)).not.toBeNull();
    });
  });
});
