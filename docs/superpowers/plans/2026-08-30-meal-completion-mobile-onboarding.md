# Meal-Completion Preference Learning — Mobile Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Culinary Compass screen with the adaptive A/B "how would you complete a meal" onboarding experience on the mobile app: a new onboarding API service, a new `MealCompletionOnboardingScreen` (pair deck → skip-with-reason → 5-factor summary), and an `AppNavigator` rewire so brand-new users are walked through it exactly once. This is sub-plan 2 of 3 and **depends on Plan 1** (`docs/superpowers/plans/2026-08-30-meal-completion-backend-core.md`) being implemented first: it consumes the exact endpoint contract and shared types Plan 1 produces.

**Architecture:** The screen is a thin client over the two Plan-1 routes. It loads a pair with `GET /api/v1/user/taste/onboarding`, submits choices with `POST /api/v1/user/taste/onboarding/answers`, and renders the final `OnboardingSummaryResponse` in-app before completing. The navigator gate that previously showed `CulinaryCompassScreen` now shows `MealCompletionOnboardingScreen` for `justOnboarded && !onboardingDone` users only (same session semantics as today), so returning users are never re-onboarded.

**Tech Stack:** React Native 0.86 (Expo SDK 57), `react-native-reanimated` 4.5.1, `@react-navigation/native-stack`, axios API client, AsyncStorage. **No new dependencies.** Verification: `npm run typecheck --workspace @meal-rescue/mobile` (tsc --noEmit) and `npm run lint --workspace @meal-rescue/mobile` (eslint `src App.tsx index.ts --ext .ts,.tsx`). Mobile has no Jest suite (`npm run test` prints "No tests yet").

## Global Constraints

- **Plan 1 must be merged first.** By execution time the shared types are rebuilt (`npm run build --workspace @meal-rescue/shared-types`) and both routes live — do NOT re-run the backend build here; just confirm `packages/shared-types/dist` contains `OnboardingStartResponse` before starting.
- Shared types are consumed via the built `dist/`. If `OnboardingPair`/`OnboardingAnswer`/`OnboardingStartResponse`/`OnboardingAnswerResponse`/`OnboardingSummaryResponse` are missing from `dist/index.d.ts`, stop and re-run the Plan-1 Task-1 build step before touching mobile code.
- Mobile verification commands (run from repo root): `npm run typecheck --workspace @meal-rescue/mobile`, `npm run lint --workspace @meal-rescue/mobile`. The husky pre-commit hook runs eslint + prettier automatically.
- Only existing Expo SDK 57 packages may be used. Per `apps/mobile/AGENTS.md`, consult https://docs.expo.dev/versions/v57.0.0/ before writing code that touches any Expo/R3N API; none of the components below require a new Expo capability.
- Never edit files via PowerShell `Get-Content | Set-Content` pipelines — use the Edit/Write tools only.
- No comments in code unless they explain non-obvious logic.
- Commit after each task (`feat:` / `refactor:` / `chore:` subjects).
- **Product-language rule:** no physiological claims in any copy ("keeps you full", "you are deficient"). All pair copy (baseMeal name, cuisineLabel, option names/blurbs) is rendered verbatim from the server — do NOT rewrite or embellish it. Reason-chip labels like "Not hungry right now" are preference statements, which are fine.
- **Cuisine rule:** `pair.baseMeal.cuisineLabel` is display-only garnish on the base-meal card ("Japanese bowl night"). Never turn it into a preference assertion ("you like Japanese food").
- **UNAVAILABLE ≠ negative:** marking an option "I don't have it" must NOT imply dislike to the user; the summary/results must not describe unavailable options as rejects.
- Do not touch any of the user's uncommitted files: `ScrapsIntroScreen.tsx` (untracked), edits to `CaptureScreen.tsx`, `HomeScreen.tsx`, `PaywallScreen.tsx`.

---

### Task 1: Onboarding API service + prune dead compass API functions

**Files:**
- Create: `apps/mobile/src/services/onboarding.api.ts`
- Modify: `apps/mobile/src/services/culture.api.ts` (remove `seedCompass` / `skipCompass`; keep `getCulture`)

**Interfaces:**
- Consumes: shared types `OnboardingStartResponse`, `OnboardingAnswer`, `OnboardingAnswerResponse` (from `@meal-rescue/shared-types` dist).
- Produces:
  - `async startOnboarding(): Promise<OnboardingStartResponse>` → `GET /api/v1/user/taste/onboarding`
  - `async answerOnboarding(answer: OnboardingAnswer): Promise<OnboardingAnswerResponse>` → `POST /api/v1/user/taste/onboarding/answers` body `{ answer }`
- After this task `culture.api.ts` exports only `getCulture` (the backend `/taste/culture` route stays; only the mobile compass write clients are removed).

- [ ] **Step 1: Verify the shared-types dist is current**

```bash
node -e "const t=require('@meal-rescue/shared-types'); console.log('ok')"
```

This only proves the package resolves. Then open `packages/shared-types/dist/index.d.ts` and confirm `OnboardingStartResponse`, `OnboardingAnswerResponse`, `OnboardingAnswer`, `OnboardingPair`, `OnboardingSummaryResponse` exist. If they are missing, run `npm run build --workspace @meal-rescue/shared-types` (Plan-1 Task-1 output) and re-check.

- [ ] **Step 2: Create the onboarding API client**

Create `apps/mobile/src/services/onboarding.api.ts`:

```ts
import type {
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingStartResponse,
} from '@meal-rescue/shared-types';

import { api } from './api';

export async function startOnboarding(): Promise<OnboardingStartResponse> {
  const res = await api.get<OnboardingStartResponse>('/api/v1/user/taste/onboarding');
  return res.data;
}

export async function answerOnboarding(
  answer: OnboardingAnswer,
): Promise<OnboardingAnswerResponse> {
  const res = await api.post<OnboardingAnswerResponse>('/api/v1/user/taste/onboarding/answers', {
    answer,
  });
  return res.data;
}
```

- [ ] **Step 3: Prune the dead compass write functions**

Overwrite `apps/mobile/src/services/culture.api.ts` with:

```ts
import type { CulinaryFamily } from '@meal-rescue/shared-types';

import { api } from './api';

export interface CultureView {
  affinities: Record<CulinaryFamily, number>;
  traditionVsModern: number;
  seeded: boolean;
}

export async function getCulture(): Promise<CultureView> {
  const res = await api.get<CultureView>('/api/v1/user/taste/culture');
  return res.data;
}
```

This removes `seedCompass` and `skipCompass` (only the to-be-deleted `CulinaryCompassScreen` used them). The `CulinaryCompassSeed` import goes away with them.

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck --workspace @meal-rescue/mobile
npm run lint --workspace @meal-rescue/mobile
```

Expected: clean. The new file is imported nowhere yet, so `onboarding.api.ts` types nothing downstream; that is fine and will be exercised in Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/onboarding.api.ts apps/mobile/src/services/culture.api.ts
git commit -m "feat: add mobile onboarding API client, remove compass writes"
```

---

### Task 2: MealCompletionOnboardingScreen

**Files:**
- Create: `apps/mobile/src/screens/MealCompletionOnboardingScreen.tsx`

**Interfaces:**
- Consumes: `onboarding.api.ts` (Task 1), `PrimaryButton`, `haptics`, `colors`/`spacing`/`typography` from `../theme`.
- Produces:
  - `export function MealCompletionOnboardingScreen({ onComplete }: { onComplete: (skipped: boolean) => void })`
- Behavior contract (mirrors the design spec + Plan-1 route validation):
  - Load: `startOnboarding()`. If `seeded` is true (edge case: a fresh session that already has event rows) → complete immediately with `onComplete(false)`; the current in-app gate only triggers for brand-new same-session users so this path is effectively unreachable, but must not hang.
  - Choose: tapping an option haptics and submits `{ pairId, selected: 'A' | 'B', unavailableOption: null }`.
  - Don't have it: per-option "I don't have this one" submits `{ pairId, selected: null, unavailableOption: 'A' | 'B' }` (never negative evidence — backend treats it as not-tested).
  - Skip: tapping "Skip — we'll learn by watching" reveals a reason chip row; the user must pick a reason to submit `{ pairId, selected: null, unavailableOption: null, rejectionReason }`. This satisfies Plan-1's route rule that an answer is invalid when `selected`, `unavailableOption` AND `rejectionReason` are all null.
  - Advance: use `OnboardingAnswerResponse`; if `next` is a pair, render it; if `summary` is present, render the summary phase.
  - Summary phase: five factor rows (label from `summary.factors[i].label`, a bar whose fill = `(score + 1) / 2`, `confidence` chip, `evidenceCount`), then a "Done — see my plate" `PrimaryButton` → `onComplete(false)`. Failsafe: also render a small "Skip" so a user can exit the summary.
  - Errors: any `ApiError` mid-flow renders an inline error + Retry; initial load failure renders the same with a retry that re-calls `startOnboarding()`.
  - Phase state machine: `'loading' | 'pair' | 'summary' | 'error'`.

- [ ] **Step 1: Write the screen**

Create `apps/mobile/src/screens/MealCompletionOnboardingScreen.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  OnboardingAnswer,
  OnboardingPair,
  OnboardingRejectionReason,
  OnboardingSummaryResponse,
} from '@meal-rescue/shared-types';

import { PrimaryButton } from '../components/PrimaryButton';
import { haptics } from '../services/haptics';
import { answerOnboarding, startOnboarding } from '../services/onboarding.api';
import { colors, spacing, typography } from '../theme';

interface Props {
  onComplete: (skipped: boolean) => void;
}

type Phase = 'loading' | 'pair' | 'summary' | 'error';

const SKIP_REASONS: Array<{ reason: OnboardingRejectionReason; label: string }> = [
  { reason: 'taste', label: 'Not for me' },
  { reason: 'too_much_effort', label: 'Too much work' },
  { reason: 'not_appropriate_for_meal', label: 'Doesn\u2019t fit the meal' },
  { reason: 'not_hungry_enough', label: 'Not hungry right now' },
];

const REASON_LABEL: Record<OnboardingRejectionReason, string> = {
  taste: 'Not for me',
  too_expensive: 'Too pricey',
  too_much_effort: 'Too much work',
  don_t_have: "Don't have it",
  don_t_like_ingredient: "Don't like an ingredient",
  not_appropriate_for_meal: 'Doesn\u2019t fit the meal',
  not_hungry_enough: 'Not hungry right now',
};

export function MealCompletionOnboardingScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [pair, setPair] = useState<OnboardingPair | null>(null);
  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    setPhase('loading');
    setBusy(true);
    try {
      const start = await startOnboarding();
      if (start.seeded) {
        onComplete(false);
        return;
      }
      if (!start.pair) {
        onComplete(false);
        return;
      }
      setPair(start.pair);
      setPhase('pair');
    } catch {
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [onComplete]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(answer: OnboardingAnswer) {
    if (busy) return;
    setBusy(true);
    setShowReasons(false);
    try {
      const res = await answerOnboarding(answer);
      setProgress((p) => p + 1);
      if (res.summary) {
        setSummary(res.summary);
        setPhase('summary');
      } else if (res.next) {
        setPair(res.next);
      } else {
        onComplete(false);
      }
    } catch {
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }

  const choose = (selected: 'A' | 'B') => {
    if (!pair || busy) return;
    haptics.selection();
    void submit({
      pairId: pair.id,
      selected,
      unavailableOption: null,
    });
  };

  const markUnavailable = (unavailableOption: 'A' | 'B') => {
    if (!pair || busy) return;
    haptics.light();
    void submit({
      pairId: pair.id,
      selected: null,
      unavailableOption,
    });
  };

  const skipWithReason = (rejectionReason: OnboardingRejectionReason) => {
    if (!pair || busy) return;
    haptics.light();
    void submit({
      pairId: pair.id,
      selected: null,
      unavailableOption: null,
      rejectionReason,
    });
  };

  const renderSummary = () => {
    if (!summary) return null;
    return (
      <Animated.View entering={FadeInDown.duration(280)} style={styles.summary}>
        <Text style={typography.title}>How you like to finish a meal</Text>
        <Text style={[typography.body, styles.subtitle]}>
          A first sketch of your taste. It learns more from what you actually do.
        </Text>
        {summary.factors.map((f) => {
          const fill = Math.max(0, Math.min(1, (f.score + 1) / 2));
          return (
            <View key={f.factor} style={styles.factorRow}>
              <View style={styles.factorHead}>
                <Text style={styles.factorLabel}>{f.label}</Text>
                <Text style={styles.factorMeta}>
                  {REASON_STATE_LABEL[f.confidence]}
                  {f.evidenceCount > 0 ? ` \u00b7 ${f.evidenceCount} ${f.evidenceCount === 1 ? 'pick' : 'picks'}` : ''}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${fill * 100}%` }]} />
              </View>
            </View>
          );
        })}
        <View style={styles.summaryActions}>
          <PrimaryButton
            label="Done \u2014 take me to my messy kitchen"
            busy={busy}
            onPress={() => onComplete(false)}
          />
        </View>
      </Animated.View>
    );
  };

  const renderPair = () => {
    if (!pair) return null;
    const { baseMeal } = pair;
    return (
      <Animated.View entering={FadeInUp.duration(280)} key={pair.id} style={styles.pair}>
        <Text style={[typography.title, styles.title]}>How do you finish a meal?</Text>
        <Text style={[typography.body, styles.subtitle]}>
          Start with the same plate. Pick the one that would make it better for you. There are no
          wrong answers.
        </Text>

        <View style={styles.baseCard}>
          <Text style={styles.baseEmoji}>{baseMeal.emoji}</Text>
          <Text style={styles.baseName}>{baseMeal.name}</Text>
          <Text style={styles.baseCuisine}>{baseMeal.cuisineLabel}</Text>
          <Text style={styles.question}>{pair.question}</Text>
        </View>

        <View style={styles.options}>
          {(['A', 'B'] as const).map((side) => {
            const option = side === 'A' ? pair.optionA : pair.optionB;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityLabel={`${option.name}. ${option.blurb}`}
                accessible
                disabled={busy}
                onPress={() => choose(side)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <Text style={styles.optionEmoji}>{option.emoji}</Text>
                <Text style={styles.optionName}>{option.name}</Text>
                <Text style={styles.optionRole}>{option.role}</Text>
                <Text style={styles.optionBlurb}>{option.blurb}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.auxRow}>
          {(['A', 'B'] as const).map((side) => {
            const option = side === 'A' ? pair.optionA : pair.optionB;
            return (
              <Pressable
                key={side}
                accessibilityRole="button"
                accessibilityLabel={`I don't have ${option.name}`}
                disabled={busy}
                onPress={() => markUnavailable(side)}
                style={styles.auxLink}
              >
                <Text style={styles.auxLinkText}>Don\u2019t have {option.name.toLowerCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        {showReasons ? (
          <View style={styles.reasons}>
            <Text style={styles.reasonsTitle}>Why skip these?</Text>
            <View style={styles.reasonChips}>
              {SKIP_REASONS.map((r) => (
                <Pressable
                  key={r.reason}
                  accessibilityRole="button"
                  accessibilityLabel={r.label}
                  disabled={busy}
                  onPress={() => skipWithReason(r.reason)}
                  style={styles.reasonChip}
                >
                  <Text style={styles.reasonChipText}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip this pair"
            disabled={busy}
            onPress={() => setShowReasons(true)}
            style={styles.skipLink}
          >
            <Text style={styles.skipText}>Skip \u2014 we\u2019ll learn by watching</Text>
          </Pressable>
        )}

        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{progress} so far</Text>
          <Text style={styles.progressHint}>Just a few comparisons</Text>
        </View>
      </Animated.View>
    );
  };

  const renderError = () => (
    <View style={styles.center}>
      <Text style={styles.errorEmoji}>&#128534;</Text>
      <Text style={[typography.heading, styles.errorTitle]}>Couldn\u2019t load your first compare</Text>
      <Text style={[typography.body, styles.subtitle]}>
        Check your connection and try again \u2014 or skip for now.
      </Text>
      <PrimaryButton label="Retry" busy={busy} onPress={() => void load()} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Skip meal onboarding"
        onPress={() => onComplete(true)}
        style={styles.skipLink}
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'loading' && (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Setting the table&hellip;</Text>
        </View>
      )}
      {phase === 'pair' && renderPair()}
      {phase === 'summary' && renderSummary()}
      {phase === 'error' && renderError()}
    </SafeAreaView>
  );
}

const REASON_STATE_LABEL: Record<OnboardingSummaryResponse['factors'][number]['confidence'], string> = {
  unknown: 'First impression',
  inferred: 'Emerging',
  confirmed: 'Solid signal',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: 15 },
  title: { textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.lg },
  pair: { flex: 1 },
  baseCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  baseEmoji: { fontSize: 42, marginBottom: spacing.xs },
  baseName: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  baseCuisine: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  options: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  option: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  optionPressed: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionEmoji: { fontSize: 30, marginBottom: spacing.xs },
  optionName: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  optionRole: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  optionBlurb: { fontSize: 13, color: colors.text, marginTop: spacing.xs, textAlign: 'center' },
  auxRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  auxLink: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  auxLinkText: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  reasons: { marginBottom: spacing.md },
  reasonsTitle: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  reasonChipText: { fontSize: 13, color: colors.text },
  skipLink: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', paddingTop: spacing.md },
  progressText: { fontSize: 12, color: colors.textSecondary },
  progressHint: { fontSize: 12, color: colors.border },
  summary: { flex: 1, justifyContent: 'center' },
  factorRow: { marginBottom: spacing.lg },
  factorHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  factorLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  factorMeta: { fontSize: 12, color: colors.textSecondary },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  summaryActions: { marginTop: spacing.xl },
  errorEmoji: { fontSize: 40, marginBottom: spacing.md },
  errorTitle: { marginBottom: spacing.sm },
});
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck --workspace @meal-rescue/mobile
npm run lint --workspace @meal-rescue/mobile
```

Expected: clean. Note `behavior note — `showReasons` reuse: after every submit the reasons panel resets; the `skip` flow requires picking a reason, exactly matching Plan-1's route rule.

- [ ] **Step 3: Self-review the screen against product rules**

- All copy above is preference/wording only; no physiological claims.
- `cuisineLabel` renders verbatim as garnish; nothing asserts a cuisine preference.
- "Don't have it" submits `unavailableOption` with `selected: null` → backend state `unavailable`, no negative evidence.
- Skip always carries a `rejectionReason`.
- `REASON_STATE_LABEL`, `SKIP_REASONS`, `REASON_LABEL` are kept small; `REASON_LABEL` is intentionally included for future reuse (e.g., a journal page) — remove it if lint flags unused, otherwise keep.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/MealCompletionOnboardingScreen.tsx
git commit -m "feat: add adaptive meal-completion onboarding screen"
```

---

### Task 3: Rewire the navigator and delete the compass

**Files:**
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`
- Delete: `apps/mobile/src/screens/CulinaryCompassScreen.tsx`

**Interfaces:**
- Consumes: `MealCompletionOnboardingScreen` (Task 2).
- Produces: gate equivalent to today's `justOnboarded && !compassDone` → now `justOnboarded && !onboardingDone` renders `MealCompletionOnboardingScreen`. `COMPASS_KEY` replaced by `ONBOARDING_KEY`. `finishCompass(skipped)` → `finishOnboarding(skipped)` with identical persisted-key + `initialHome` behavior.

- [ ] **Step 1: Edit the import + key**

In `apps/mobile/src/navigation/AppNavigator.tsx`:

- Replace:
```ts
import { CulinaryCompassScreen } from '../screens/CulinaryCompassScreen';
```
  with:
```ts
import { MealCompletionOnboardingScreen } from '../screens/MealCompletionOnboardingScreen';
```

- Replace:
```ts
const COMPASS_KEY = 'meal-rescue/compass-seen';
```
  with:
```ts
const ONBOARDING_KEY = 'meal-rescue/completion-onboarding-done';
```

- [ ] **Step 2: Edit the state + handlers**

- Replace the comment block above `justOnboarded` and the two state lines:

```ts
  // Brand-new users are walked through the meal-completion onboarding right after
  // the Scraps intro; returning users who already passed onboarding never get it.
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
```

- Replace `finishCompass` with:

```ts
  function finishOnboarding(skipped: boolean) {
    AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setOnboardingDone(true);
    if (skipped) {
      setInitialHome('HomeMain');
      setIntroSeen(true);
    }
  }
```

- [ ] **Step 3: Edit the render gate**

Replace:

```tsx
        ) : justOnboarded && !compassDone ? (
          <CulinaryCompassScreen onComplete={finishCompass} />
```

with:

```tsx
        ) : justOnboarded && !onboardingDone ? (
          <MealCompletionOnboardingScreen onComplete={finishOnboarding} />
```

- [ ] **Step 4: Delete the compass screen**

```bash
git rm apps/mobile/src/screens/CulinaryCompassScreen.tsx
```

Confirm no other file imports it: `grep -r CulinaryCompassScreen apps/mobile/src` (via the Grep tool). Only `AppNavigator.tsx` remains referenced before this step, and it is already rewired.

- [ ] **Step 5: Typecheck + lint + full grep sweep**

```bash
npm run typecheck --workspace @meal-rescue/mobile
npm run lint --workspace @meal-rescue/mobile
```

Also grep the mobile tree for any remaining `seedCompass` / `skipCompass` / `CulinaryCompassScreen` / `compass-seen` references — the only legitimate remaining string is `getCulture` in `culture.api.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/navigation/AppNavigator.tsx apps/mobile/src/screens/CulinaryCompassScreen.tsx
git commit -m "feat: route new users through meal-completion onboarding"
```

> The `git add` includes the deleted path (stages the deletion). The husky hook runs prettier/eslint on staged files only.

---

### Task 4: Emulator smoke test (manual)

**Files:** none (verification only).

- [ ] **Step 1: Boot the dev build and log the backend**

Backend (from an earlier terminal, Plan-1 output) must be running on `:3010`; the mobile app connects through `EXPO_PUBLIC_API_BASE_URL` (Android emulator → `http://10.0.2.2:3010`). Start Metro with `npm run dev` in `apps/mobile`, then `npm run android` (Expo SDK 57 dev build, `com.mealrescue.app`). Use `adb -s emulator-5554` when a specific emulator is running.

- [ ] **Step 2: Walk the happy path**

1. Fresh install / clear app data (`adb uninstall com.mealrescue.app` is too heavy; instead `adb shell pm clear com.mealrescue.app`), relaunch.
2. Scraps intro appears → finish it → meal-completion onboarding appears (not the compass).
3. Base card shows emoji + name + cuisineLabel; tap option A → haptics, next pair animates in; repeat through 7 pairs.
4. On one pair, tap "Don't have <option>" → advances; later `GET /api/v1/user/taste/culture` or a backend log shows the `addition_events` row with `state: 'unavailable'` and `selected: null`.
5. On one pair, skip → reason chips appear → pick "Not for me" → advances.
6. After the 7th answer the 5-factor summary renders (bars + confidence labels) → "Done" → lands on Home tab.
7. Kill + relaunch app → intro is seen → goes straight to Tabs (no re-onboarding).

- [ ] **Step 3: Error path**

1. Stop the backend, kill + relaunch the app, finish intro → onboarding shows the error state with Retry and "Skip for now".
2. Stop the backend mid-onboarding → error state appears; Retry re-calls `startOnboarding()`.

- [ ] **Step 4: Record results**

Note any deviations in `docs/superpowers/plans/2026-08-30-meal-completion-mobile-onboarding.md` under a `## Execution Notes` heading (or, if working from a task-sheet clone, in the checkbox comments). No commit needed for this task.

---

## Execution Notes

Implemented 2026-08-30 (commits `3277b61`, `8f2c57d`, `09abff3` on `main`). Mobile `npm run typecheck` and `npm run lint` both pass (exit 0). The user's uncommitted files were left untouched.

### Deviations from the plan text (all required to make the code work / lint / render correctly)

1. **`haptics.selection()` does not exist.** The app's `haptics` object (`apps/mobile/src/services/haptics.ts`) exposes only `light`, `medium`, `success`, `warning`. The screen's `choose()` used `haptics.selection()` (as written in the plan) and would have thrown at runtime. Replaced with `haptics.light()`.
2. **`REASON_LABEL` was unused → removed.** The plan itself flagged this ("remove it if lint flags unused"); `@typescript-eslint/no-unused-vars` would have failed the pre-commit hook. Dropped it (kept `REASON_STATE_LABEL` and `SKIP_REASONS`, both used).
3. **JSX `\u2014`/`\u2019` escapes render literally.** In JSX attribute strings (`label="Done \u2014 ..."`) and JSX text children, `\uXXXX` is treated as literal text, not an escape. Replaced with real `—` / `’` characters in the JSX (the escapes inside JS string/template literals — `SKIP_REASONS` and the `·` in the summary meta — are correct and untouched). Without this the button/label text would have shown `\u2014` verbatim.
4. **Plan Task-1 step-4 typecheck cannot be clean at that intermediate commit.** Removing `seedCompass`/`skipCompass` from `culture.api.ts` (Task 1) breaks `CulinaryCompassScreen.tsx`'s imports until Task 3 deletes that screen. `tsc` therefore errored between Tasks 1 and 3. This is inherent to the plan's ordering (prune API before deleting the only consumer); resolved once Task 3's deletion landed, and the final tree typechecks clean.

### Environment note (not code)

`npm run lint` for any workspace was broken mid-session because the hoisted `@eslint/eslintrc` dependency was missing from `node_modules`. Fixed with a root `npm install` (lockfile-respecting; no `package.json` changes). Verified both workspaces lint green afterward.

### Task 4 status — NOT EXECUTED

The emulator smoke test (Task 4) is a manual, device-dependent check (running backend on `:3010`, Metro + Android emulator via Expo SDK 57, `adb` walk of happy/error paths). It was not run in this environment. Remaining manual steps to execute on-device: fresh install → Scraps intro → meal-completion onboarding (7 pairs) → 5-factor summary → Done → Tabs; relaunch shows no re-onboarding; backend-down error path with Retry / "Skip for now".

- **Spec coverage:** adaptive A/B replace-the-compass onboarding (Task 2 screen), culinary compass removal (Tasks 1 & 3), one-shot gated entry (Task 3), skip-with-reason satisfying Plan-1 route validation (Task 2), summary confidence display (Task 2), no physiological claims + cuisine-as-display-only + UNAVAILABLE≠negative (Task 2 step 3 self-review).
- **Backend contract fidelity:** every URL, method, body shape, and response shape comes from Plan 1 Task 5 (`GET /taste/onboarding`, `POST /taste/onboarding/answers`, `{ answer }`, `OnboardingStartResponse`/`OnboardingAnswerResponse`); all types import from the built shared-types dist. The one subtle coupling — Plan-1's "answer must not be fully empty" rule — is handled by making skip require a reason (no backend change needed).
- **Dependency check:** Plan 1 must be implemented first (endpoints + rebuilt dist). No new npm packages; only existing Expo SDK 57 + reanimated 4 APIs.
- **Placeholder scan:** every task contains real code/commands; Task 4 is explicitly a manual smoke-check with concrete steps (no CI exists for mobile).
- **Repo hygiene:** no user-owned uncommitted files are modified (ScrapsIntroScreen stays untouched; AppNavigator edits are ours and are scoped to compass/onboarding concerns only).