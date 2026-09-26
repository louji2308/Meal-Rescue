/**
 * AiPlannerService — human-like conversational meal planning (AI-first).
 *
 * This is the only planning path for the Meal Plan chat: the model reasons
 * about the request end to end. It receives:
 *   - the user's text verbatim
 *   - taste memory and learned preferences per member
 *   - the last two weeks of rescues (actual meals eaten)
 *   - the kitchen state (inventory, expiring, leftovers, held items)
 *   - current planned meals, open slots, rules, exposure
 *   - the real current date and a next-7-day date grid
 * It plans like a thoughtful human: kitchen is context, never a cage; it asks
 * a question only when the missing detail genuinely changes the plan; and it
 * runs inside a SESSION whose previous output is reused on every turn, so a
 * follow-up edit ("make dinner lighter") edits the last plan instead of
 * starting from scratch.
 *
 * HARD RULES (enforced in prompt + post-model validation):
 *   - never more than 3 distinct plan days per plan
 *   - "whole day" => all four slots; a specific slot request => only that slot
 *   - ask only genuinely-necessary questions, at most 3, tap options + free text
 *
 * There is NO deterministic/heuristic fallback: if the LLM is unavailable or
 * fails, the request surfaces a clear, recoverable error instead of a
 * silently-planned week.
 */
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type {
  AiPlannerMeal,
  AiPlannerQuestion,
  AiPlannerResponse,
  EffortLevel,
  FoodWorldState,
  MealSlot,
  PlanPreviewResponse,
  PlannedDay,
  PlannedMeal,
  UUID,
} from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { LlmClient } from '../ai/llm-client';
import { HouseholdService } from '../common-table/household.service';
import { planPreviewService } from '../plan-preview.service';
import { addDays, dateKeyFor, nextWeekStartFor, weekStartFor } from './date-utils';
import { WorldStateService } from './world-state.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PLAN_MEALS = 28;
const MAX_DAYS = 3; // hard cap: never more than 3 distinct plan days
const MAX_QUESTIONS = 3;
const MAX_TURNS_KEPT = 6;

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const ALL_DAY_SLOTS = 'breakfast, lunch, dinner, snack';

/** Normalize a question so repeats can be detected regardless of punctuation/case. */
function normalizeQuestion(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Prompt — the "thinks like a human" system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the household's personal meal planner — warm, practical, and deeply attuned to how real families actually eat. You think like a human, not a form-filler.

Your job is to turn whatever the person says into ONE of two things:
1. "ready" — a concrete, day-by-day meal plan (the preview shows before anything is saved), or
2. "clarification" — only the few questions that genuinely change the plan.

## HARD RULE: never plan more than 3 days
You MUST NOT output a plan covering more than 3 distinct days. 3 days is the absolute maximum, no exceptions — never a full week, never "the month".
- If the person asks for more than 3 days (e.g. "plan the whole week", "every day"), do NOT plan them. Return "clarification" and ask which 3 days they want planned first (offer tap options like "Next 3 days", plus free text).
- A "plan for tomorrow" request means exactly 1 day unless they say more.

## Slot scope — match exactly what they asked
- "Whole day" / "plan a full day" / no slots mentioned for a full day => plan ALL four slots: ${ALL_DAY_SLOTS}.
- A specific slot ("dinner", "lunch", "breakfast", "snack") => plan ONLY that slot (or those slots).
- If an evening meal has no slot named, "dinner" is the sensible default; afternoon => lunch.

## Dates — anchor to the real calendar provided to you
- The context includes "today" (the real current date) and a "dateGrid" of the next 7 days with weekday names.
- "tomorrow" = the date right after today. A weekday name ("friday") = the next upcoming occurrence of that day.
- Each planned meal MUST carry a real, existing dateKey from the grid or an explicitly requested specific date. Never invent dates.
- These dates are exactly where the plan will be saved when the user accepts — be precise.

## The household is real people, not entries
- Every member has a taste memory: likes, dislikes, allergies, avoid-lists, spice tolerance, dietary restrictions, and learned ingredient affinities. Honour them. Never plan something a member is allergic to or visibly dislikes if you can avoid it.
- The last two weeks of rescues (recently eaten meals) tell you what they are tired of and what they loved. Vary meals they have eaten a lot lately; lean back into dishes they clearly enjoyed.
- Taste psychology: liking an ingredient is NOT a reason to serve it every day. Avoid eating fatigue — rotate proteins, cuisines, and staple ingredients across the planned days. Do not reflexively default to the same beloved staple (e.g. eggs) just because they like it.
- Use "exposure" and "lastTwoWeeks" to avoid recently over-eaten ingredients and dishes.
- Infer the household size, effort budget, and pace from the context. Work days deserve easy meals more than weekends do.

## The kitchen is context, never a cage
- You see the kitchen state: pantry, expiring items, leftovers, held/reserved ingredients.
- Prefer using expiring items and leftovers — real planners do — but never force a meal around them. If the person asks for something specific and the exact ingredient is missing, plan it anyway and note the missing item. A craving beats a cupboard.
- Leftovers you schedule should be plausible (the dish actually exists, right serving size).

## Read the whole message before you decide
- People bury their real request mid-sentence ("dinner on tuesday but make it light, we have curry").
- Detect implicit time and scope: "tomorrow" -> that day; "this week" -> the planning days they mean.
- If a meal is implied but its slot is not, default sensibly (dinner for evenings; lunch for afternoons).

## Ask only when it truly matters
Do NOT interrogate. Ask at most ${MAX_QUESTIONS} questions, and only when the missing detail changes the plan and you cannot default sensibly. Good reasons to ask:
- Which days to plan when several are plausible and differ meaningfully (e.g. "plan me something" with no day at all — ASK which day/s).
- Whether to plan one shared "base meal" reused across all slots vs different meals per slot (only when it changes the outcome and history does not answer it).
- Effort/servings when it changes the meals and history does not answer it.
Each question must offer tap-ready options AND allow a typed answer. If history already answers a question, do not ask it.

## Never repeat a question
- "previouslyAskedQuestions" lists questions you already asked in this conversation in normalised form. You MUST NOT ask any of them again. Re-asking is the worst outcome.
- When the person answers your question — including a short confirmation like "yes", "ok", "sure", "do it", "fine", or "whatever you think" — treat that as your cue to PLAN with sensible defaults. Do not re-read their answer as a new ambiguous request. Do not ask again. Choose the most reasonable interpretation (for example: "yes" to "plan tomorrow?" means plan tomorrow, all slots, feeding the household) and go straight to "ready".
- If the only detail left is one you could default sensibly, default it and produce the plan. The plan is previewed before anything is saved, so a good default is safe — the person can tweak it.

## Output shape
Return STRICT JSON only:
{
  "status": "ready" | "clarification",
  "message": "one warm, short line the user sees in the UI",
  "questions": [ { "id": "q1", "question": "...", "options": ["...", "..."], "freeText": true } ],
  "plan": [
    {
      "dateKey": "YYYY-MM-DD",
      "mealSlot": "breakfast" | "lunch" | "dinner" | "snack",
      "concept": "Brief appetizing name",
      "ingredients": ["...", "..."],
      "effort": "low" | "medium" | "high",
      "usesLeftover": true,
      "baseMeal": false,
      "note": "why this pick, or which kitchen item it uses up"
    }
  ]
}
- "ready" requires a non-empty plan covering at most ${MAX_DAYS} distinct dates; "clarification" requires non-empty questions and an empty/null plan.
- Write concepts in Title-like case (first letter of each major word capital) but keep them human and short.
- Share one day's "base" meal across its slots by giving each slot the same concept and marking exactly one slot (usually dinner) baseMeal:true.
- Keep notes short and human. You may reference kitchen items, expiring items, or leftover reuse in notes.
- Never invent allergies, restrictions, items, or dates; use only the context given.`;

// ---------------------------------------------------------------------------
// Zod schema for the model output
// ---------------------------------------------------------------------------

const planMealSchema = z
  .object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealSlot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    concept: z.string().min(1).max(160),
    ingredients: z.array(z.string().min(1).max(100)).max(20).default([]),
    effort: z.enum(['low', 'medium', 'high']).nullable().optional(),
    usesLeftover: z.boolean().nullable().optional(),
    baseMeal: z.boolean().nullable().optional(),
    note: z.string().max(240).nullable().optional(),
  })
  .strict();

const questionSchema = z
  .object({
    id: z.string().min(1).max(40),
    question: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(120)).max(6).nullable().optional(),
    freeText: z.boolean().nullable().optional(),
  })
  .strict();

const aiPlanOutputSchema = z
  .object({
    status: z.enum(['ready', 'clarification']),
    message: z.string().min(1).max(500),
    questions: z.array(questionSchema).max(MAX_QUESTIONS).nullable().optional(),
    plan: z.array(planMealSchema).max(MAX_PLAN_MEALS).nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Session memory
// ---------------------------------------------------------------------------

export interface PlannerTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface PlannerSession {
  id: UUID;
  userId: UUID;
  householdId: UUID;
  turns: PlannerTurn[];
  lastPlan: AiPlannerMeal[] | null;
  lastMessage: string | null;
  /** Normalized question texts already asked, so the model never repeats itself. */
  askedQuestions: string[];
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AiPlannerService {
  private readonly sessions = new Map<string, PlannerSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly llm: LlmClient,
    private readonly worldStateService: WorldStateService,
    private readonly householdService: HouseholdService,
  ) {
    this.startCleanup();
  }

  /** The planner is AI-only: a heuristic/no-network client cannot plan. */
  private get available(): boolean {
    return this.llm.versionLabel !== 'heuristic:v1';
  }

  private startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (session.expiresAt <= now) this.sessions.delete(id);
      }
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  /**
   * Start a new conversation (no sessionId) or continue an existing one.
   * Continuing reuses the previous plan output + turn history so edits land on
   * top of the last result instead of restarting.
   */
  async plan(
    userId: UUID,
    sessionId: string | null,
    text: string,
  ): Promise<AiPlannerResponse | null> {
    if (!this.available) {
      throw new AppError({
        category: ErrorCategory.AI_MODEL_FAILURE,
        code: 'AI_PLANNER_UNAVAILABLE',
        message:
          'The AI meal planner is not available right now — a model service key is required.',
        statusCode: 503,
        recoverable: true,
        suggestedAction: 'Set the AI model service key on the server, then retry.',
      });
    }

    const householdId = await this.requireHouseholdId(userId);
    const todayKey = dateKeyFor(new Date(), 0);

    let session: PlannerSession;
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (!existing || existing.userId !== userId) {
        return null; // unknown / expired / foreign session
      }
      existing.expiresAt = Date.now() + SESSION_TTL_MS;
      session = existing;
    } else {
      session = {
        id: randomUUID(),
        userId,
        householdId,
        turns: [],
        lastPlan: null,
        lastMessage: null,
        askedQuestions: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      this.sessions.set(session.id, session);
    }

    session.turns.push({ role: 'user', content: text });
    if (session.turns.length > MAX_TURNS_KEPT) {
      session.turns = session.turns.slice(-MAX_TURNS_KEPT);
    }

    const world = await this.worldStateService.getState(householdId, userId);
    const context = this.buildPlanContext(world, todayKey);

    let safe: {
      status: 'ready' | 'clarification';
      message: string;
      questions: AiPlannerQuestion[];
      plan: AiPlannerMeal[];
    };
    try {
      const asked = new Set(session.askedQuestions);

      const callModel = async (extraInstruction?: string) => {
        const { data } = await this.llm.completeJson({
          systemPrompt: `${SYSTEM_PROMPT}\n\n${extraInstruction ?? ''}`,
          userContent: {
            context,
            conversation: session.turns,
            previousPlan: session.lastPlan,
            previouslyAskedQuestions: [...asked],
            today: todayKey,
            thisWeekStart: weekStartFor(todayKey),
            nextWeekStart: nextWeekStartFor(todayKey),
          },
          schema: aiPlanOutputSchema,
          modelName: env.OPENAI_TEXT_MODEL,
          maxTokens: 1600,
        });
        return this.sanitize(data, todayKey);
      };

      let result = await callModel();

      // Guard: never surface a question that was already asked. If the model
      // only re-asks (e.g. after a terse "yes"), retry once and order it to
      // produce the plan with sensible defaults instead.
      let fresh = result.questions.filter((q) => !asked.has(normalizeQuestion(q.question)));
      if (result.status === 'clarification' && fresh.length === 0) {
        result = await callModel(
          'The person already answered your question with a short confirmation. STOP asking — ' +
            'choose the most sensible default (the requested day/slots, all slots for a day, the whole household) ' +
            'and output a "ready" plan right now. Re-asking is not allowed.',
        );
        fresh = result.questions.filter((q) => !asked.has(normalizeQuestion(q.question)));
      }
      safe = { ...result, questions: fresh };

      // Never surface an empty clarification (the model refused to re-ask and
      // produced no plan). One fresh, non-repeated question keeps the chat alive.
      if (safe.status === 'clarification' && safe.questions.length === 0) {
        safe = {
          status: 'clarification',
          message: 'Sure — just tell me which day(s) to plan and I’ll put it together.',
          questions: [
            {
              id: 'scope-retry',
              question: 'Which day(s) should I plan for?',
              options: ['Tomorrow for everyone', 'Next 3 days', 'Just dinner tonight'],
              freeText: true,
            },
          ],
          plan: [],
        };
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError({
        category: ErrorCategory.AI_MODEL_FAILURE,
        code: 'AI_PLANNER_FAILED',
        message: 'The AI meal planner hit an error. Please try again.',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Try again in a moment.',
        details: error instanceof Error ? { reason: error.message } : { reason: String(error) },
      });
    }

    if (safe.status === 'ready' && safe.plan.length > 0) {
      session.lastPlan = safe.plan;
      session.lastMessage = safe.message;
      const preview = await this.stagePreview(userId, safe.plan);
      session.turns.push({
        role: 'assistant',
        content: JSON.stringify({ message: safe.message, plan: safe.plan }),
      });
      return {
        sessionId: session.id,
        status: 'ready',
        message: safe.message,
        questions: [],
        preview,
      };
    }

    for (const q of safe.questions) {
      session.askedQuestions.push(normalizeQuestion(q.question));
    }
    session.turns.push({
      role: 'assistant',
      content: JSON.stringify({ message: safe.message, questions: safe.questions }),
    });
    return {
      sessionId: session.id,
      status: 'clarification',
      message: safe.message,
      questions: safe.questions,
      preview: null,
    };
  }

  // -- internals ------------------------------------------------------------

  private sanitize(
    data: z.infer<typeof aiPlanOutputSchema>,
    todayKey: string,
  ): {
    status: 'ready' | 'clarification';
    message: string;
    questions: AiPlannerQuestion[];
    plan: AiPlannerMeal[];
  } {
    const questions = (data.questions ?? [])
      .filter((q) => q.question.trim())
      .map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options?.length ? q.options : undefined,
        freeText: q.freeText ?? true,
      }));

    if (data.status === 'clarification' && questions.length > 0) {
      return {
        status: 'clarification',
        message: data.message || 'I need one small detail to plan this right.',
        questions: questions.slice(0, MAX_QUESTIONS),
        plan: [],
      };
    }

    if (data.status === 'ready' && (data.plan ?? []).length > 0) {
      const plan = this.sanitizePlan(data.plan ?? [], todayKey);
      if (plan.length > 0) {
        return {
          status: 'ready',
          message: data.message || 'Here is a plan for the coming days.',
          questions: [],
          plan,
        };
      }
    }

    // The model could not produce a valid plan within the constraints — ask
    // once for the missing detail instead of silently producing nothing.
    return {
      status: 'clarification',
      message: 'Could you tell me which days and roughly how many people this is for?',
      questions: [
        {
          id: 'scope',
          question: 'Which days should I plan, and for how many?',
          options: ['Tomorrow for everyone', 'Next 3 days', 'Just dinner tonight'],
          freeText: true,
        },
      ],
      plan: [],
    };
  }

  private sanitizePlan(raw: z.infer<typeof planMealSchema>[], todayKey: string): AiPlannerMeal[] {
    const thisWeekStart = weekStartFor(todayKey);
    const windowStart = addDays(thisWeekStart, -1);
    const windowEnd = addDays(nextWeekStartFor(todayKey), 6);
    const seen = new Set<string>();
    const plan: AiPlannerMeal[] = [];

    for (const meal of raw) {
      const concept = meal.concept.trim();
      if (!concept) continue;
      if (meal.dateKey < windowStart || meal.dateKey > windowEnd) continue;
      const slot = meal.mealSlot as MealSlot;
      if (!MEAL_SLOTS.includes(slot)) continue;
      const key = `${meal.dateKey}:${slot}`;
      if (seen.has(key)) continue;
      seen.add(key);

      plan.push({
        dateKey: meal.dateKey,
        mealSlot: slot,
        concept: concept.slice(0, 160),
        ingredients: (meal.ingredients ?? []).slice(0, 20),
        effort: (meal.effort ?? null) as EffortLevel | null,
        baseMeal: meal.baseMeal === true,
        usesLeftover: meal.usesLeftover === true,
        note: meal.note?.trim().slice(0, 240) ?? null,
      });
      if (plan.length >= MAX_PLAN_MEALS) break;
    }

    // HARD RULE: never more than 3 distinct plan days.
    return this.capToMaxDays(plan);
  }

  /** Keep at most MAX_DAYS distinct dates, preserving ascending date order. */
  private capToMaxDays(plan: AiPlannerMeal[]): AiPlannerMeal[] {
    if (plan.length === 0) return plan;
    const byDate = new Map<string, AiPlannerMeal[]>();
    for (const meal of plan) {
      const bucket = byDate.get(meal.dateKey) ?? [];
      bucket.push(meal);
      byDate.set(meal.dateKey, bucket);
    }
    const dates = [...byDate.keys()].sort().slice(0, MAX_DAYS);
    const allowed = new Set(dates);
    return plan.filter((meal) => allowed.has(meal.dateKey));
  }

  async stagePreview(userId: UUID, plan: AiPlannerMeal[]): Promise<PlanPreviewResponse> {
    const days = this.toPlannedDays(plan);
    const preview = await planPreviewService.generatePreview(userId, {
      days,
      daysPlanned: plan.length,
    });
    return { ...preview, expiresAt: preview.expiresAt.toISOString() };
  }

  private toPlannedDays(plan: AiPlannerMeal[]): PlannedDay[] {
    const byDay = new Map<string, PlannedMeal[]>();
    for (const meal of plan) {
      const list = byDay.get(meal.dateKey) ?? [];
      const prep = meal.effort === 'low' ? 10 : meal.effort === 'high' ? 45 : 25;
      list.push({
        id: randomUUID(),
        name: meal.concept,
        recipeName: meal.concept,
        ingredients: meal.ingredients ?? [],
        servings: 4,
        prepTimeMinutes: prep,
        cookTimeMinutes: meal.effort === 'low' ? 15 : meal.effort === 'high' ? 75 : 40,
        mealSlot: meal.mealSlot,
      });
      byDay.set(meal.dateKey, list);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, meals]) => ({ dateKey, meals }));
  }

  private buildPlanContext(world: FoodWorldState, todayKey: string): Record<string, unknown> {
    return {
      household: world.household?.name ?? 'your household',
      members: world.householdMembers.map((m) => ({
        name: m.displayName,
        allergies: m.allergies ?? [],
        avoids: m.avoidIngredients ?? [],
        restrictions: m.dietaryRestrictions ?? [],
        likes: (m.likes ?? []).slice(0, 12),
        dislikes: (m.dislikes ?? []).slice(0, 12),
        spice: m.spiceLevel ?? 'unspecified',
        affinities: Object.entries(m.learnedIngredientAffinities ?? {})
          .filter(([, v]) => Math.abs(v) > 0.3)
          .map(([k, v]) => ({ ingredient: k, affinity: Math.round(v * 100) / 100 })),
      })),
      kitchen: {
        pantry: world.inventory
          .filter(
            (i) => i.kind === 'pantry' && (i.availableQuantity == null || i.availableQuantity > 0),
          )
          .map((i) => ({
            name: i.name,
            qty: i.availableQuantity == null ? null : i.availableQuantity,
            unit: i.unit,
            held: i.reservedQuantity > 0,
          }))
          .slice(0, 60),
        expiringSoon: world.expiringItems.map((i) => ({
          name: i.name,
          inDays: i.daysUntilExpiry,
        })),
        leftovers: world.leftovers.map((l) => ({
          dish: l.dishName ?? l.name,
          servings: l.servings,
          ageDays: l.madeAt
            ? Math.max(0, Math.round((Date.now() - new Date(l.madeAt).getTime()) / 86_400_000))
            : null,
        })),
      },
      lastTwoWeeks: world.recentMeals.slice(0, 14).map((m) => ({
        date: m.dateKey,
        slot: m.mealSlot,
        concept: m.concept,
        liked: m.mealRole,
      })),
      tasteSignals: world.learnedPreferences.slice(0, 20).map((p) => ({
        memberId: p.memberId,
        ingredient: p.ingredient,
        affinity: p.affinity,
        declared: p.source === 'declared',
      })),
      currentlyPlanned: world.plannedMeals
        .filter(
          (m): m is typeof m & { dateKey: string; concept: string } =>
            Boolean(m.dateKey && m.concept) && m.state !== 'CANCELLED',
        )
        .map((m) => ({ date: m.dateKey, slot: m.mealSlot, concept: m.concept })),
      openSlots: world.openSlots.slice(0, 40),
      blockedSlots: world.blockedSlots.slice(0, 20),
      rules: world.activeConstraints.slice(0, 25).map((c) => c.description),
      exposure: world.mealExposure.slice(0, 25),
      today: todayKey,
      dateGrid: Array.from({ length: 7 }, (_, i) => {
        const dateKey = addDays(todayKey, i);
        const date = new Date(`${dateKey}T00:00:00.000Z`);
        return {
          dateKey,
          weekday: date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        };
      }),
    };
  }

  private async requireHouseholdId(userId: UUID): Promise<UUID> {
    const household = await this.householdService.getForUser(userId);
    if (!household) {
      throw new Error('HOUSEHOLD_NOT_FOUND');
    }
    return household.id;
  }
}
