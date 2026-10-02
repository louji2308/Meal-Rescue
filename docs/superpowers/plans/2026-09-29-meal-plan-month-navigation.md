# Meal Plan Month Navigation — Smoothness & Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make month navigation in the Meal Plan tab feel instant and predictable — never snap back to another month on its own, no blank day card, no jarring day-strip jumps.

**Architecture:** Three independent defects cause the bad UX: (1) `loadWeek` has no request ordering, so a slow response lands late and overwrites the visible week; (2) the screen force-syncs the viewed month to whatever `weekStart` the store returns, so any background reload yanks the user back to the current month; (3) month navigation focuses an arbitrary mid-month day but loads the first-Monday week, so the day card is often blank. Fix the store first (ordering + cache + argless = current week), then free the screen (viewed month changes only on user action), then make month changes load the focused day's week with an animated strip recenter.

**Tech Stack:** React Native 0.86 / Expo 57, Zustand 5 store, `react-native-reanimated` 4, TypeScript strict.

## Global Constraints

- **NEVER `git add`, `git commit`, or `git push`.** Every task ends at verification, not a commit.
- **Do not start Metro / do not build an APK.** The user installs builds themselves; changes land in their next build.
- Verification gate for every task: `npm run typecheck --workspace @meal-rescue/mobile` then `npm run lint --workspace @meal-rescue/mobile`. Expected: 0 errors, 18 pre-existing warnings (baseline).
- The mobile package has no test runner (`"test": "echo \"No tests yet\" && exit 0"`), so the gate is typecheck + lint + the manual device checklist in Task 6.
- Keep `DEMO_MODE` behavior working: `getWeek()` in `apps/mobile/src/services/meal-memory.api.ts:76-86` must stay untouched.
- Do not modify purchase/paywall code (`PlanReviewPopup.tsx`, `PaywallScreen.tsx`) in this plan.

---

## Diagnosis (exact root causes)

| # | Symptom | Root cause | Location |
|---|---|---|---|
| 1 | Month "auto-moves back" | `loadWeek` has no sequence guard (unlike `shiftWeek`, which uses `shiftSeq`), so an older in-flight response resolves last and overwrites `weekStart` | `apps/mobile/src/stores/meal-memory.store.ts:236-254` |
| 2 | Month snaps back after 30 s / after saving / after a chat message | Effect force-syncs `viewedYM` to `ymKey(weekStart)` on **every** `weekStart` change; argless `loadWeek()` returns the server's *current* week | `apps/mobile/src/screens/MealPlanScreen.tsx:432-436` + store `loadWeek` argless branch + `:387-393`, `:624` |
| 3 | Focused day yanked out of the viewed month | Clamp effect rewrites `focusedKey` into whatever week was just loaded | `MealPlanScreen.tsx:425-430` |
| 4 | Blank day card after a month change | `goToMonth` focuses mid-month (`days[Math.floor(len/2)]`) but loads `firstMondayInMonth` — usually a different week, so `selectedDay` is `null` and the card renders `null` | `MealPlanScreen.tsx:537-545`, `:740`, `:898` |
| 5 | Slow / jarring feel | Every tap is a blocking network call with two spinners (header `:611`, strip `:720`), no week cache, and the day strip re-centers with `animated: false` | `MealPlanScreen.tsx:458-462` |
| 6 | Rapid taps land unpredictably | Multiple un-ordered requests per tap (compounded by #1) | store `loadWeek` |

## File Structure

| File | Responsibility in this plan |
|---|---|
| `apps/mobile/src/stores/meal-memory.store.ts` | Request ordering (seq), 60 s week cache, argless reload targets the currently displayed week |
| `apps/mobile/src/screens/MealPlanScreen.tsx` | Viewed month is user-controlled only; month change focuses a predictable day and loads *its* week; animated strip recenter; quieter loading state |
| `docs/superpowers/plans/2026-09-29-meal-plan-month-navigation.md` | This plan |

---

### Task 1: Store — ordering guard, week cache, argless = current week

**Files:**
- Modify: `apps/mobile/src/stores/meal-memory.store.ts:62` (add module state) and `:236-254` (replace `loadWeek`)

**Interfaces:**
- Consumes: `getWeek` (`services/meal-memory.api.ts:76`), `activeSoloMemberId()`, `toApiError`, existing `MealMemoryWeekResponse` import (line 12).
- Produces: unchanged signature `loadWeek: (weekStart?: string) => Promise<void>` (interface at line 106) — callers in Tasks 2–4 keep working. New behavior: (a) last write wins, (b) `weekStart` omitted ⇒ re-fetch the week currently in state, (c) fresh cache paints instantly without `busy`.

- [ ] **Step 1: Add module-level ordering + cache state next to `shiftSeq`**

In `apps/mobile/src/stores/meal-memory.store.ts`, directly after line 62 (`let shiftSeq = 0;`) add:

```ts
let loadWeekSeq = 0;
const WEEK_CACHE_TTL_MS = 60_000;
const weekCache = new Map<string, { week: MealMemoryWeekResponse; at: number }>();
```

- [ ] **Step 2: Replace the `loadWeek` body (lines 236-254)**

Replace the whole `loadWeek:` implementation with:

```ts
  loadWeek: async (weekStart) => {
    // Argless = refresh the week the user is looking at. Falling back to the
    // server's "current week" used to yank the calendar back to today after
    // every save / focus / pull-to-refresh reload.
    const target = weekStart ?? (get().weekStart || undefined);
    const seq = ++loadWeekSeq;
    const prevWeek = get().week;
    const prevWeekStart = get().weekStart;

    const cached = target ? weekCache.get(target) : undefined;
    if (cached && Date.now() - cached.at < WEEK_CACHE_TTL_MS) {
      // Instant paint from cache (no spinner), then revalidate below.
      set({ week: cached.week, weekStart: cached.week.weekStart, busy: false, error: null });
    } else if (target) {
      set({ weekStart: target, busy: true, error: null });
    } else {
      set({ busy: true, error: null });
    }

    try {
      const week = await getWeek(target, activeSoloMemberId() ?? undefined);
      if (seq !== loadWeekSeq) return; // a newer navigation won the race
      weekCache.set(week.weekStart, { week, at: Date.now() });
      set({ week, weekStart: week.weekStart, busy: false });
    } catch (err) {
      if (seq !== loadWeekSeq) return;
      if (!get().week && prevWeek) {
        set({ week: prevWeek, weekStart: prevWeekStart });
      }
      set({ error: toApiError(err), busy: false });
    }
  },
```

Note the parentheses in `weekStart ?? (get().weekStart || undefined)` — mixing `??` and `||` unparenthesized is a syntax error.

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace @meal-rescue/mobile`
Expected: exits 0, no output beyond the script banner.

Run: `npm run lint --workspace @meal-rescue/mobile`
Expected: `✖ 18 problems (0 errors, 18 warnings)` — the 18 are pre-existing baseline.

---

### Task 2: Screen — viewed month never moves on its own

**Files:**
- Modify: `apps/mobile/src/screens/MealPlanScreen.tsx:432-436` (delete the `viewedYM` sync effect) and `:425-430` (reduce the `focusedKey` clamp to initial default only)

**Interfaces:**
- Consumes: `weekStart` selector (line 301), `viewedYM` state (line 361), `focusedKey` state.
- Produces: invariant — `viewedYM` changes only via `goToMonth` (Task 4); `focusedKey` keeps the user's chosen day. Nothing downstream reads these effects.

- [ ] **Step 1: Delete the `viewedYM` force-sync effect**

Delete these lines entirely (currently `MealPlanScreen.tsx:432-436`):

```ts
  useEffect(() => {
    if (!weekStart) return;
    const wkYM = ymKey(weekStart);
    setViewedYM((prev) => (prev === wkYM ? prev : wkYM));
  }, [weekStart]);
```

- [ ] **Step 2: Replace the `focusedKey` clamp with an initial-default-only effect**

Replace the effect at `MealPlanScreen.tsx:425-430`:

```ts
  useEffect(() => {
    if (!weekStart) return;
    if (!focusedKey || focusedKey < weekStart || focusedKey > addDays(weekStart, 6)) {
      setFocusedKey(today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart);
    }
  }, [weekStart]);
```

with:

```ts
  // Default the focus once, on first load. Never re-clamp afterwards — the
  // user's chosen day must survive background reloads and month navigation.
  useEffect(() => {
    if (focusedKey || !weekStart) return;
    setFocusedKey(today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart);
  }, [weekStart, focusedKey]);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace @meal-rescue/mobile`
Expected: exits 0.

Run: `npm run lint --workspace @meal-rescue/mobile`
Expected: `0 errors` (18 baseline warnings).

---

### Task 3: Screen — animated day-strip recenter

**Files:**
- Modify: `apps/mobile/src/screens/MealPlanScreen.tsx:458-462` (scroll effect) plus a new ref near line 356

**Interfaces:**
- Consumes: `dayScrollRef` (line 356), `focusedDayIndex` (line 447), `cellW` (line 365), `monthDays` (line 438).
- Produces: `recenterAnimated` ref — set `true` by `goToMonth` in Task 4 before the data swap so the strip slides instead of jumping.

- [ ] **Step 1: Add the recenter flag**

After line 356 (`const dayScrollRef = useRef<FlatList<string>>(null);`) add:

```ts
  // True when the next strip recenter is a user-driven month change (animate),
  // false for background reindexing (instant).
  const recenterAnimated = useRef(false);
```

- [ ] **Step 2: Honor the flag in the recenter effect**

Replace the effect at `MealPlanScreen.tsx:458-462`:

```ts
  useEffect(() => {
    if (cellW > 0 && dayScrollRef.current && monthDays.length > 0) {
      dayScrollRef.current.scrollToOffset({ offset: focusedDayIndex * cellW, animated: false });
    }
  }, [focusedDayIndex, cellW]);
```

with:

```ts
  useEffect(() => {
    if (cellW > 0 && dayScrollRef.current && monthDays.length > 0) {
      dayScrollRef.current.scrollToOffset({
        offset: focusedDayIndex * cellW,
        animated: recenterAnimated.current,
      });
      recenterAnimated.current = false;
    }
  }, [focusedDayIndex, cellW, monthDays]);
```

`monthDays` is added to deps so the recenter runs after the new month's data is in the list.

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace @meal-rescue/mobile && npm run lint --workspace @meal-rescue/mobile`
Expected: typecheck exits 0; lint `0 errors`.

---

### Task 4: Screen — predictable month change (focus + load the right week)

**Files:**
- Modify: `apps/mobile/src/screens/MealPlanScreen.tsx:537-545` (`goToMonth`) and add `mondayOf` beside the date helpers (`:114-120`)

**Interfaces:**
- Consumes: `addMonthsYM` (`:93`), `daysInMonth` (`:99`), `dayNumber` (`:76`), `addDays` (`:65`), `loadWeek`, `recenterAnimated` (Task 3).
- Produces: `mondayOf(dateKey): string` — also reused by the existing inline Monday math in `handleDayMomentumScrollEnd` (`:512-515`) and `handleDayTap` (`:528-531`).

- [ ] **Step 1: Add the `mondayOf` helper**

After `firstMondayInMonth` (line 120) add:

```ts
/** Monday of the week containing `dateKey` (Mon-start ISO week). */
function mondayOf(dateKey: string): string {
  const dow = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return addDays(dateKey, dow === 0 ? -6 : 1 - dow);
}
```

- [ ] **Step 2: Replace `goToMonth`**

Replace `MealPlanScreen.tsx:537-545`:

```ts
  function goToMonth(delta: number) {
    const targetYM = addMonthsYM(currentYM, delta);
    setViewedYM(targetYM);
    setExpanded(null);
    const days = daysInMonth(targetYM);
    const focusTarget = days.includes(today) ? today : days[Math.floor(days.length / 2)];
    if (focusTarget) setFocusedKey(focusTarget);
    void loadWeek(firstMondayInMonth(targetYM));
  }
```

with:

```ts
  function goToMonth(delta: number) {
    const targetYM = addMonthsYM(currentYM, delta);
    const days = daysInMonth(targetYM);
    // Keep the day-of-month the user is already on (clamp to the target
    // month's length) so stepping forward feels continuous, never arbitrary.
    const dayNum = dayNumber(focusedKey || today);
    const candidate = `${targetYM}-${String(dayNum).padStart(2, '0')}`;
    const focusTarget = days.includes(candidate) ? candidate : days[days.length - 1];
    if (!focusTarget) return;
    setViewedYM(targetYM);
    setFocusedKey(focusTarget);
    setExpanded(null);
    recenterAnimated.current = true;
    // Load the week UNDER the focused day — that is what the day card reads.
    void loadWeek(mondayOf(focusTarget));
  }
```

- [ ] **Step 3: DRY the duplicated Monday math in the two day handlers**

In `handleDayMomentumScrollEnd` (lines 511-516) replace:

```ts
        if (!weekDaySet.has(newKey)) {
          const dayDate = new Date(`${newKey}T00:00:00.000Z`);
          const dow = dayDate.getUTCDay();
          const mondayOffset = dow === 0 ? -6 : 1 - dow;
          void loadWeek(addDays(newKey, mondayOffset));
        }
```

with:

```ts
        if (!weekDaySet.has(newKey)) {
          void loadWeek(mondayOf(newKey));
        }
```

In `handleDayTap` (lines 527-532) make the identical replacement:

```ts
      if (!weekDaySet.has(key)) {
        void loadWeek(mondayOf(key));
      }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck --workspace @meal-rescue/mobile && npm run lint --workspace @meal-rescue/mobile`
Expected: typecheck exits 0; lint `0 errors`. If lint flags `firstMondayInMonth` as unused, delete that function (line 114-120) — it has no other callers.

---

### Task 5: Screen — spinner only when data is actually missing

**Files:**
- Modify: `apps/mobile/src/screens/MealPlanScreen.tsx:720-724` (strip spinner) and add a memo near line 493

**Interfaces:**
- Consumes: `busy` (line 304), `weekDaySet` (line 442), `focusedKey`.
- Produces: `focusLoaded` boolean used by the strip spinner only (header spinner at `:611` stays as-is — it honestly reports any store activity such as chat saves).

- [ ] **Step 1: Add the memo**

After the `lockedDaySet` memo (line 493) add:

```ts
  /** Is the focused day's week already in memory? Drives the strip spinner. */
  const focusLoaded = focusedKey ? weekDaySet.has(focusedKey) : false;
```

- [ ] **Step 2: Gate the strip spinner**

Replace lines 720-724:

```tsx
                {busy && (
                  <View style={styles.dayStripLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
```

with:

```tsx
                {busy && !focusLoaded && (
                  <View style={styles.dayStripLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                )}
```

Effect: month taps show the strip spinner only until the new week lands; background refreshes of already-visible data no longer overlay a spinner on the strip.

- [ ] **Step 3: Verify**

Run: `npm run typecheck --workspace @meal-rescue/mobile && npm run lint --workspace @meal-rescue/mobile`
Expected: typecheck exits 0; lint `0 errors`.

---

### Task 6: Verification (typecheck, lint, device checklist)

**Files:** none (read-only verification).

- [ ] **Step 1: Full gates**

Run: `npm run typecheck --workspace @meal-rescue/mobile && npm run lint --workspace @meal-rescue/mobile && npm run typecheck --workspace @meal-rescue/backend && npm run lint --workspace @meal-rescue/backend`
Expected: all four exit 0; mobile lint `0 errors (18 warnings)`, backend lint `0 errors (16 warnings)`. Backend was not touched — running it proves nothing broke at the workspace level.

- [ ] **Step 2: Manual device checklist (after the user's next APK build — do NOT start Metro)**

1. Open Meal Plan → tap **next month 5× fast**: lands on month +5, label matches the strip, no snap-back after 3 s.
2. Sit on a future month 35 s (and background/foreground the app): month and focused day unchanged.
3. Send a chat message / accept a plan while on a future month: week refreshes in place, month unchanged.
4. Pull-to-refresh on a future month: no month change; strip spinner appears only if the focused week isn't loaded.
5. After any month tap: the day card under the strip is populated immediately (no blank block).
6. Revisit the previous month: data appears instantly (60 s cache), spinner absent or brief.
7. Strip recenter on chevron taps slides smoothly; tapping a single day still snaps it to the center marker.

- [ ] **Step 3: Report**

Summarize: files changed, gate results, and any checklist item that failed (with the exact step number). **Do not commit.**

---

## Self-Review

- **Coverage:** snap-back from races → Task 1 (seq); snap-back from argless reloads → Task 1 (target = current week) + Task 2 (viewedYM effect deleted); focused-day yank → Task 2 (clamp); blank day card → Task 4 (load focused week); slowness → Task 1 (cache) + Task 5 (spinner) + Task 3 (animated recenter); rapid taps → Task 1 seq; verification → Task 6. No gaps found.
- **Placeholders:** none — every step carries exact code, paths and commands.
- **Type consistency:** `loadWeek(weekStart?: string)` unchanged (Task 1 note); `mondayOf` defined in Task 4 Step 1 before its uses in Tasks 4 Steps 2-3; `recenterAnimated` defined in Task 3 before Task 4 uses it; `focusLoaded` defined in Task 5 Step 1 before Step 2.
