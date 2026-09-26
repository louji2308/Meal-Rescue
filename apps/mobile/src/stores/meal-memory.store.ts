import { create } from 'zustand';

import type {
  AiPlannerQuestion,
  MealEvent,
  MealMemoryCreateRuleRequest,
  MealMemoryFeedbackRequest,
  MealMemoryIntentResponse,
  MealMemoryRecordActualRequest,
  MealMemoryRememberRequest,
  MealMemoryUpdateMealRequest,
  MealMemoryWeekResponse,
  MealRule,
  PlanPreviewResponse,
  PlanWeekRequest,
} from '@meal-rescue/shared-types';

import { toApiError } from '../services/api';
import {
  confirmIntent,
  createRule,
  deactivateRule as deactivateRuleApi,
  getRecents,
  getWeek,
  listRules,
  moveMeal,
  planWeek,
  postAiPlan,
  postFeedback,
  postIntent,
  postPlanConfirm,
  recordActual,
  remember,
  removeMeal,
  reuseWeek,
  updateMeal,
} from '../services/meal-memory.api';
import { useCommonTableStore } from './common-table.store';

/**
 * Meal Memory store — drives the agent tab: free-text intents, the weekly
 * calendar grid, active rules, and reality memory. Screen code subscribes to
 * this store and calls actions; API errors surface through `error`.
 *
 * Cell/ingredient edits flow through `autosaveUpdateEvent`: the change is
 * applied optimistically to the local week immediately, the PATCH is
 * debounced (~900ms), a Saved/Saving… indicator tracks the flush, and a
 * failed save rolls the local grid back instead of corrupting it.
 */

const AUTOSAVE_DEBOUNCE_MS = 900;
const SAVED_INDICATOR_MS = 2200;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveHadFailure = false;
let pendingAutosave: {
  eventId: string;
  input: MealMemoryUpdateMealRequest;
  before: MealEvent | null;
} | null = null;
let shiftSeq = 0;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  /** Recently eaten meals (for quick re-planning). */
  recentMeals: MealEvent[];
  /** Plan preview for review before confirmation. */
  planPreview: PlanPreviewResponse | null;
  /** Whether the plan review modal is visible. */
  showPlanReview: boolean;
  /** Live AI planning session — carried so edits reuse the last plan. */
  aiSessionId: string | null;
  /** Outstanding AI clarification when the model needs one detail. */
  aiClarification: { message: string; questions: AiPlannerQuestion[] } | null;
  planReviewEpoch: number;
  /** Auto-save flush indicator (debounced cell/ingredient edits). */
  saveStatus: SaveStatus;

  busy: boolean;
  error: ReturnType<typeof toApiError> | null;

  loadWeek: (weekStart?: string) => Promise<void>;
  shiftWeek: (delta: number) => Promise<void>;
  sendIntent: (text: string) => Promise<MealMemoryIntentResponse>;
  answerIntent: (intentId: string, answer: string) => Promise<MealMemoryIntentResponse>;
  planThisWeek: (input?: Omit<PlanWeekRequest, 'weekStart'>) => Promise<void>;
  moveEvent: (
    eventId: string,
    dateKey: string,
    mealSlot?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  ) => Promise<void>;
  removeEvent: (eventId: string) => Promise<void>;
  markActual: (input: MealMemoryRecordActualRequest) => Promise<void>;
  feedBack: (input: MealMemoryFeedbackRequest) => Promise<void>;
  markRemembered: (input: MealMemoryRememberRequest) => Promise<void>;
  updateEvent: (eventId: string, input: MealMemoryUpdateMealRequest) => Promise<void>;
  autosaveUpdateEvent: (eventId: string, input: MealMemoryUpdateMealRequest) => void;
  reuseLastWeek: () => Promise<void>;
  loadRecents: () => Promise<void>;
  loadRules: () => Promise<void>;
  addRule: (input: MealMemoryCreateRuleRequest) => Promise<void>;
  deactivateRule: (ruleId: string) => Promise<void>;
  startOrEditAiPlan: (text: string, sessionId?: string | null) => Promise<void>;
  answerAiClarification: (answer: string) => Promise<void>;
  confirmPlan: (previewId: string, edits?: string) => Promise<void>;
  cancelPlanReview: () => void;
  clearError: () => void;
  reset: () => void;
}

function shiftWeekStart(weekStart: string, delta: number): string {
  const anchor = new Date(`${weekStart}T00:00:00.000Z`);
  anchor.setUTCDate(anchor.getUTCDate() + delta * 7);
  return anchor.toISOString().slice(0, 10);
}

const PLANNING_DAY_WORDS =
  /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|this week|next week|the weekend|weekend)\b/i;
const PLANNING_VERBS = /\b(plan|schedule|set up|make|build|replan|re-plan|rework)\b/i;

/**
 * True when the free-text message is a request to create or rework the meal
 * plan ("plan", "help me with the plan", "schedule our week"), as opposed to a
 * small instant action ("I ate X", "no eggs", "move dinner to tuesday").
 *
 * These messages are routed to the AI planner directly — never to the
 * deterministic intent classifier, which classified bare planning phrases as
 * SCHEDULE and looped back with "what meal / which day" clarification forever.
 */
export function isPlanningRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Bare "plan" verbs always planning, even without a day ("plan something",
  // "make me a plan", "help me plan").
  if (/\b(plan|replan|re-plan|rework)\b/i.test(trimmed)) return true;

  // "schedule/make/build/set up" count as planning only when a day is named,
  // so quick actions like "make pasta" or "schedule the kids" stay instant.
  return PLANNING_DAY_WORDS.test(trimmed) && PLANNING_VERBS.test(trimmed);
}

/** When exactly one household member is selected, scope the view to them. */
function activeSoloMemberId(): string | null {
  const ids = useCommonTableStore.getState().selectedMemberIds;
  return ids.length === 1 ? ids[0] : null;
}

function currentPendingAutosave(): typeof pendingAutosave {
  return pendingAutosave;
}

function eventPatch(event: MealEvent): MealMemoryUpdateMealRequest {
  return {
    concept: event.concept ?? undefined,
    memberIds: event.memberIds ?? undefined,
    effort: event.effort ?? undefined,
    state: event.state ?? undefined,
    slotStatus: event.slotStatus ?? undefined,
  };
}

function applyAutosavePatch(
  state: { week: MealMemoryWeekResponse | null },
  eventId: string,
  input: MealMemoryUpdateMealRequest,
): { week: MealMemoryWeekResponse | null } | null {
  const week = state.week;
  if (!week) return null;
  let changed = false;
  const days = week.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const meal = slot.planned;
      if (!meal || meal.id !== eventId) return slot;
      changed = true;
      return {
        ...slot,
        planned: {
          ...meal,
          concept: input.concept ?? meal.concept,
          memberIds: input.memberIds ?? meal.memberIds,
          effort: input.effort ?? meal.effort,
          state: input.state ?? meal.state,
          slotStatus: input.slotStatus ?? meal.slotStatus,
          updatedAt: new Date().toISOString(),
        },
      };
    }),
  }));
  return changed ? { week: { ...week, days } } : null;
}

export const useMealMemoryStore = create<MealMemoryState>((set, get) => ({
  week: null,
  weekStart: '',
  pendingIntent: null,
  rules: [],
  lastMessage: null,
  recentMeals: [],
  planPreview: null,
  showPlanReview: false,
  aiSessionId: null,
  aiClarification: null,
  planReviewEpoch: 0,
  saveStatus: 'idle',
  busy: false,
  error: null,

  loadWeek: async (weekStart) => {
    const prevWeek = get().week;
    const prevWeekStart = get().weekStart;
    if (weekStart) {
      set({ weekStart, busy: true, error: null });
    } else {
      set({ busy: true, error: null });
    }
    try {
      const week = await getWeek(weekStart, activeSoloMemberId() ?? undefined);
      set({ week, weekStart: week.weekStart, busy: false });
    } catch (err) {
      if (!get().week && prevWeek) {
        set({ week: prevWeek, weekStart: prevWeekStart, error: toApiError(err), busy: false });
      } else {
        set({ error: toApiError(err), busy: false });
      }
    }
  },

  shiftWeek: async (delta) => {
    const current = get().weekStart;
    if (!current) return;
    const next = shiftWeekStart(current, delta);
    const seq = ++shiftSeq;
    set({ weekStart: next, error: null });
    try {
      const week = await getWeek(next, activeSoloMemberId() ?? undefined);
      if (seq !== shiftSeq) return;
      set({ week, weekStart: week.weekStart });
    } catch (err) {
      if (seq !== shiftSeq) return;
      set({ error: toApiError(err) });
    }
  },

  sendIntent: async (text) => {
    set({ busy: true, error: null });
    try {
      const sessionId = get().aiSessionId;
      const pendingClarification = get().aiClarification;

      // A planning-family request goes straight to the AI planner on first
      // message too. Routing it through the deterministic classifier first is
      // what caused the "ask the same question again" loop: SCHEDULE without a
      // meal concept always came back asking for one. The AI gets the full
      // household context and asks only what genuinely changes the plan.
      // The same applies to every message while an AI planning session is
      // alive — answers to its questions, or edits of its last plan — which is
      // why these are one branch before the deterministic classifier.
      if (isPlanningRequest(text) || sessionId || pendingClarification !== null) {
        await get().startOrEditAiPlan(text, sessionId ?? null);
        return {
          intentId: '',
          status: 'awaiting_confirmation',
          resolution: {
            intent: 'PLAN_WEEK',
            confidence: 0,
            confidenceBand: 'LOW',
            entities: {
              mealConcept: null,
              targetDate: null,
              targetHorizon: null,
              mealSlot: null,
              excludedDay: null,
              ingredient: null,
              memberId: null,
              blockType: null,
              effort: null,
              constraint: null,
              moveTarget: null,
            },
            rawText: text,
            requiresClarification: false,
            clarificationQuestion: null,
          },
          clarification: null,
          result: null,
        } satisfies MealMemoryIntentResponse;
      }

      const response = await postIntent({ text });
      const intent = response.resolution?.intent;
      const isPlanningIntent = intent === 'PLAN_WEEK' || intent === 'REPLAN';

      if (isPlanningIntent) {
        await get().startOrEditAiPlan(text);
        return response;
      }

      set({ pendingIntent: response, lastMessage: response.result?.message ?? null });
      await get().loadWeek();
      await get().loadRules();
      await get().loadRecents();
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

  startOrEditAiPlan: async (text, sessionId) => {
    const epoch = get().planReviewEpoch;
    set({ busy: true, error: null });
    try {
      const response = await postAiPlan({
        text,
        sessionId: sessionId ?? get().aiSessionId ?? null,
      });
      if (epoch !== get().planReviewEpoch) return;

      if (response.status === 'ready' && response.preview) {
        set({
          aiSessionId: response.sessionId,
          planPreview: response.preview,
          showPlanReview: true,
          aiClarification: null,
          lastMessage: response.message,
        });
      } else if (response.status === 'clarification') {
        set({
          aiSessionId: response.sessionId,
          aiClarification: {
            message: response.message,
            questions: response.questions,
          },
          planPreview: null,
          showPlanReview: false,
          lastMessage: response.message,
        });
      }
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  answerAiClarification: async (answer) => {
    const sessionId = get().aiSessionId;
    if (!sessionId) {
      // No live session yet — treat stray answers as a fresh planning prompt.
      await get().startOrEditAiPlan(answer, null);
      return;
    }
    await get().startOrEditAiPlan(answer, sessionId);
  },

  confirmPlan: async (previewId, edits) => {
    set({ busy: true, error: null });
    try {
      await postPlanConfirm({ previewId, edits });
      set({
        planPreview: null,
        showPlanReview: false,
        aiSessionId: null,
        aiClarification: null,
        lastMessage: 'Plan confirmed.',
      });
      await get().loadWeek();
      await get().loadRecents();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  cancelPlanReview: () => {
    set({
      planPreview: null,
      showPlanReview: false,
      aiSessionId: null,
      aiClarification: null,
      error: null,
      planReviewEpoch: get().planReviewEpoch + 1,
    });
  },

  planThisWeek: async (input) => {
    set({ busy: true, error: null });
    const solo = activeSoloMemberId();
    const memberIds = solo ? [solo] : undefined;
    try {
      const { result } = await planWeek({
        weekStart: get().weekStart || undefined,
        ...input,
        memberIds,
      });
      set({ lastMessage: result.plan ? 'Plan ready for the week.' : 'The week stays open.' });
      await get().loadWeek();
      await get().loadRecents();
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
      const saved = await updateMeal(eventId, input);
      const applied = applyAutosavePatch(get(), eventId, eventPatch(saved));
      if (applied) set(applied);
      set({ saveStatus: 'saved' });
    } catch (err) {
      set({ error: toApiError(err), saveStatus: 'error' });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  autosaveUpdateEvent: (eventId, input) => {
    if (!get().week || !findPlannedEvent(get().week, eventId)) return;
    if (input.concept !== undefined && input.concept.trim() === '') return;

    const before = findPlannedEvent(get().week, eventId);
    pendingAutosave = { eventId, input, before: before ?? null };
    const applied = applyAutosavePatch(get(), eventId, input);
    if (applied) set(applied);
    set({ saveStatus: 'saving' });

    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const pending = pendingAutosave;
      if (!pending) return;
      pendingAutosave = null;
      const { eventId: id, input: patch, before } = pending;
      void (async () => {
        try {
          const saved = await updateMeal(id, patch);
          set({ saveStatus: 'saved', error: autosaveHadFailure ? null : get().error });
          autosaveHadFailure = false;
          if (savedTimer) clearTimeout(savedTimer);
          savedTimer = setTimeout(() => set({ saveStatus: 'idle' }), SAVED_INDICATOR_MS);
          const superseded = currentPendingAutosave()?.eventId === id;
          if (!superseded) {
            const applied = applyAutosavePatch(get(), id, eventPatch(saved));
            if (applied) set(applied);
          }
        } catch (err) {
          const superseded = currentPendingAutosave()?.eventId === id;
          if (!superseded && before) {
            const applied = applyAutosavePatch(get(), id, eventPatch(before));
            if (applied) set(applied);
          }
          autosaveHadFailure = true;
          set({ error: toApiError(err), saveStatus: 'error' });
          if (savedTimer) clearTimeout(savedTimer);
          savedTimer = setTimeout(() => set({ saveStatus: 'idle' }), SAVED_INDICATOR_MS);
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);
  },

  reuseLastWeek: async () => {
    set({ busy: true, error: null });
    try {
      if (!get().weekStart) await get().loadWeek();
      const response = await reuseWeek({ toWeekStart: get().weekStart || undefined });
      set({
        lastMessage: response.copied.length
          ? `Reused ${response.copied.length} meal${response.copied.length === 1 ? '' : 's'} from last week.`
          : 'Nothing reusable from last week.',
      });
      await get().loadWeek();
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  loadRecents: async () => {
    try {
      const response = await getRecents();
      set({ recentMeals: response.meals });
    } catch {
      // Recents are a convenience strip — stay empty, never a banner.
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
    try {
      const rules = await listRules();
      set({ rules });
    } catch (err) {
      set({ error: toApiError(err) });
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

  deactivateRule: async (ruleId) => {
    set({ busy: true, error: null });
    try {
      const deactivated = await deactivateRuleApi(ruleId);
      set({ rules: get().rules.filter((r) => r.id !== deactivated.id) });
    } catch (err) {
      set({ error: toApiError(err) });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (savedTimer) clearTimeout(savedTimer);
    autosaveTimer = null;
    savedTimer = null;
    pendingAutosave = null;
    autosaveHadFailure = false;
    set({
      week: null,
      weekStart: '',
      pendingIntent: null,
      rules: [],
      lastMessage: null,
      recentMeals: [],
      planPreview: null,
      showPlanReview: false,
      saveStatus: 'idle',
      busy: false,
      error: null,
    });
  },
}));

function findPlannedEvent(week: MealMemoryWeekResponse | null, eventId: string): MealEvent | null {
  if (!week) return null;
  for (const day of week.days) {
    for (const slot of day.slots) {
      if (slot.planned?.id === eventId) return slot.planned;
    }
  }
  return null;
}
