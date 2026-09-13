import { create } from 'zustand';

import type {
  MealMemoryCreateRuleRequest,
  MealMemoryFeedbackRequest,
  MealMemoryIntentResponse,
  MealMemoryRecordActualRequest,
  MealMemoryRememberRequest,
  MealMemoryUpdateMealRequest,
  MealMemoryWeekResponse,
  MealRule,
  PlanWeekRequest,
} from '@meal-rescue/shared-types';

import {
  confirmIntent,
  createRule,
  getWeek,
  listRules,
  moveMeal,
  planWeek,
  postFeedback,
  postIntent,
  recordActual,
  remember,
  removeMeal,
  updateMeal,
} from '../services/meal-memory.api';
import { toApiError } from '../services/api';

/**
 * Meal Memory store — drives the agent tab: free-text intents, the weekly
 * calendar grid, active rules, and reality memory. Screen code subscribes to
 * this store and calls actions; API errors surface through `error`.
 */

interface MealMemoryState {
  /** Calendar grid for the currently selected week. */
  week: MealMemoryWeekResponse | null;
  weekStart: string;
  /** The last free-text intent + its resolution status. */
  pendingIntent: MealMemoryIntentResponse | null;
  /** Active explicit rules for the household. */
  rules: MealRule[];
  /** Last action result message (e.g. plan confirmation copy). */
  lastMessage: string | null;

  busy: boolean;
  error: ReturnType<typeof toApiError> | null;

  loadWeek: (weekStart?: string) => Promise<void>;
  shiftWeek: (delta: number) => Promise<void>;
  sendIntent: (text: string) => Promise<MealMemoryIntentResponse>;
  answerIntent: (intentId: string, answer: string) => Promise<MealMemoryIntentResponse>;
  planThisWeek: (input?: Omit<PlanWeekRequest, 'weekStart'>) => Promise<void>;
  moveEvent: (eventId: string, dateKey: string, mealSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack') => Promise<void>;
  removeEvent: (eventId: string) => Promise<void>;
  markActual: (input: MealMemoryRecordActualRequest) => Promise<void>;
  feedBack: (input: MealMemoryFeedbackRequest) => Promise<void>;
  markRemembered: (input: MealMemoryRememberRequest) => Promise<void>;
  updateEvent: (eventId: string, input: MealMemoryUpdateMealRequest) => Promise<void>;
  loadRules: () => Promise<void>;
  addRule: (input: MealMemoryCreateRuleRequest) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function shiftWeekStart(weekStart: string, delta: number): string {
  const anchor = new Date(`${weekStart}T00:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + delta * 7);
  return anchor.toISOString().slice(0, 10);
}

export const useMealMemoryStore = create<MealMemoryState>((set, get) => ({
  week: null,
  weekStart: '',
  pendingIntent: null,
  rules: [],
  lastMessage: null,
  busy: false,
  error: null,

  loadWeek: async (weekStart) => {
    set({ busy: true, error: null });
    try {
      const week = await getWeek(weekStart);
      set({ week, weekStart: week.weekStart });
    } catch (err) {
      set({ error: toApiError(err) });
    } finally {
      set({ busy: false });
    }
  },

  shiftWeek: async (delta) => {
    const current = get().weekStart;
    if (!current) return;
    await get().loadWeek(shiftWeekStart(current, delta));
  },

  sendIntent: async (text) => {
    set({ busy: true, error: null });
    try {
      const response = await postIntent({ text });
      set({ pendingIntent: response, lastMessage: response.result?.message ?? null });
      await get().loadWeek();
      await get().loadRules();
      return response;
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  answerIntent: async (intentId, answer) => {
    set({ busy: true, error: null });
    try {
      const response = await confirmIntent({ intentId, answer });
      set({
        pendingIntent:
          response.status === 'awaiting_confirmation' || response.status === 'clarification'
            ? response
            : null,
        lastMessage: response.result?.message ?? null,
      });
      await get().loadWeek();
      await get().loadRules();
      return response;
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  planThisWeek: async (input) => {
    set({ busy: true, error: null });
    try {
      const { result } = await planWeek({ weekStart: get().weekStart || undefined, ...input });
      set({ lastMessage: result.plan ? 'Plan ready for the week.' : 'The week stays open.' });
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  moveEvent: async (eventId, dateKey, mealSlot) => {
    set({ busy: true, error: null });
    try {
      await moveMeal(eventId, { dateKey, mealSlot });
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  removeEvent: async (eventId) => {
    set({ busy: true, error: null });
    try {
      await removeMeal(eventId);
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  updateEvent: async (eventId, input) => {
    set({ busy: true, error: null });
    try {
      await updateMeal(eventId, input);
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  markActual: async (input) => {
    set({ busy: true, error: null });
    try {
      const response = await recordActual(input);
      set({ lastMessage: `Recorded ${response.event.state.toLowerCase()}.` });
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  feedBack: async (input) => {
    set({ busy: true, error: null });
    try {
      await postFeedback(input);
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  markRemembered: async (input) => {
    set({ busy: true, error: null });
    try {
      const response = await remember(input);
      set({ lastMessage: response.messages.join(' ') || 'Remembered.' });
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  loadRules: async () => {
    set({ busy: true, error: null });
    try {
      const rules = await listRules();
      set({ rules });
    } catch (err) {
      set({ error: toApiError(err) });
    } finally {
      set({ busy: false });
    }
  },

  addRule: async (input) => {
    set({ busy: true, error: null });
    try {
      const rule = await createRule(input);
      set({ rules: [...get().rules, rule] });
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      week: null,
      weekStart: '',
      pendingIntent: null,
      rules: [],
      lastMessage: null,
      busy: false,
      error: null,
    }),
}));