# AI-First Meal Plan Tab — Design

Date: 2026-09-22
Status: Approved (user chose Option B)

## Goal

Make the Meal Plan hint bar an **AI-first conversational planner**:

- The AI receives the *full* household context (verbatim prompt, taste memory,
  kitchen pantry/leftovers/expiring, last ~2 weeks of rescues, current planned
  meals/rules/exposure/exposure window) and plans like a thoughtful human.
- The AI asks questions **only when genuinely necessary** (max 3, tap-options +
  free-text). E.g. "plan" with no day → ask which day instead of guessing wrong.
- **Hard cap: never more than 3 plan-days in one plan.** Not negotiable.
- "Whole day" → all 4 slots (breakfast/lunch/dinner/snack). Specific slot(s) →
  only those.
- The deterministic / heuristic fallback for *planning* is removed: if the LLM
  is unavailable or fails, the user gets a clear error — never a silent
  heuristic plan.
- Preview is shown in a **centered popup** with an **always-visible prompt
  textbox + Send button** to ask the AI to edit the plan, plus **Accept** /
  **Cancel**.
- Editing runs inside the **same AI session** so the AI "remembers" the previous
  plan (session memory, 30-min TTL, last 6 turns).
- **Nothing is written to the DB until Accept.** Accept saves the **final** plan,
  to the **exact requested dates**, with **Title Case** (first letter uppercase)
  meal/concept names.
- Non-planning small actions ("I ate X", rules, quick move/remove) keep the
  existing instant handlers (Option B).

## Current-state bugs being fixed

1. `ai-planner.service.ts` sends `modelName: 'meal-memory-ai-planner'` but the
   OpenAI client uses that string as the literal model id → OpenRouter call
   fails → session silently falls back to deterministic planning. Fix: use the
   real configured text model (from env).
2. Same alias problem in `meal-memory-ai.service.ts` (intent polish, plan
   polish, instructions use non-model strings).
3. AI planner hard-falls back to `deterministicPlan()` on any non-ready output.
   Remove that fallback for the Meal Plan planning flow.

## Architecture (frontend → backend)

### Frontend (mobile)

- `MealPlanScreen.tsx` — hint bar `handleSend()` → store `sendIntent(text)`.
- `meal-memory.store.ts` — `sendIntent`:
  - POSTs to `/api/v1/meal-memory/intent` (router only: "is this planning?").
  - If intent is planning (PLAN_WEEK / REPLAN / MODIFY_SCHEDULE / MOVE_MEAL /
    REMOVE_MEAL / etc.) → delegate to the AI planner session instead:
    `postAiPlan({ text })`.
  - Non-planning (record actual, rules, remember, feedback…) → existing
    deterministic handlers, unchanged.
- New store fields: `aiSessionId: string | null`, `aiClarification:
  { message, questions[] } | null`, `planPreview`, `showPlanReview`.
- New store actions:
  - `startOrEditPlan(text, sessionId?)` → `POST /ai-plan` with the session;
    handle `ready` (open popup with `preview` + keep `sessionId`) or
    `clarification` (show questions in the hint bar/composer).
  - `answerPlanQuestion(answer)` → re-send the answer as the next AI turn in the
    same session, collecting a refreshed preview/questions.
  - `confirmPlan(previewId)` → existing `POST /plan-confirm` (saves final plan to
    DB with requested dates + Title Case).
  - `cancelPlanReview()` → drop preview + session.
- `PlanReviewPopup.tsx` — redesign:
  - Centered modal, correct size (current maxWidth 400 + new maxHeight +
    scrolling).
  - Persistent "edit the plan" textbox + Send → calls `startOrEditPlan(prompt,
    sessionId)` on the same session, replacing the preview.
  - Shows AI message + current plan days.
  - Accept (also handles paywall `requiresPayment`), Cancel, close.

### Backend

- `routes/ai-planner.routes.ts` — unchanged contract; keep `{ text, sessionId? }`.
- `services/meal-memory/ai-planner.service.ts`:
  - System prompt strengthened: 3-day hard cap; whole-day → 4 slots; only
    necessary questions; taste psychology (do not reflexively reuse a loved
    staple / vary by recent rescues & exposure); it gets today's date + next-7
    date grid.
  - Remove deterministic fallback (`deterministicPlan` + degraded branches): on
    LLM failure or non-usable output → throw a clear, recoverable error the UI
    can surface. No heuristic plan.
  - Enforce 3-day cap in `sanitizePlan` (post-model validation, not just prompt).
  - Use the real configured text model (`modelName` → env text model).
- `services/meal-memory/meal-memory-ai.service.ts` — same model-alias fix
  (use real text model).
- `services/plan-preview.service.ts` — `confirmPreview`:
  - Title Case meal/concept names on save (first letter uppercase).
  - Save each meal to its exact `dateKey`/`mealSlot`.
- `.env.example` — keep `OPENAI_API_KEY` semantics; actually set the user's
  OpenRouter key in `.env` (gitignored).

## Non-goals

- No changes to: deterministic small-action handlers, `plan-week` route, other
  tabs activation of AI. Heuristic client stays for its other call sites
  (ranking/vision fallbacks) but the *Meal Plan planning* path never uses it.