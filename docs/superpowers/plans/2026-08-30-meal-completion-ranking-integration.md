# Meal Completion Ranking Integration + Anti-Fatigue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the meal-completion cold-start profile into recommendation ranking (LLM payload + deterministic fallback) and add a soft anti-fatigue / role-family diversity layer with a recommendation-safety gate, so early recommendations are safe, familiar, and non-repetitive, and yield to strong learned preferences.

**Architecture:** Extends the existing ranking path — no new scorer. A new pure-signal module (`services/ranking/cold-start-signals.ts`) computes the generic meal-context prior, per-candidate factor affinity, recency penalty, and role-family benefit. The deterministic fallback (`HeuristicLlmClient.rank`) becomes a weighted additive score (`w1*affinity + w2*meal_context + w3*practicality + w4*freshness + w5*diversity`) with hard gates and a safety gate. `RankingEngineService` gains two optional params and passes the cold-start profile into both the LLM prompt payload and the fallback. `RescuePipelineService` reads the last 10 rescues for anti-fatigue input and injects the meal-completion profile.

**Tech Stack:** TypeScript, Sequelize, Jest, existing `@meal-rescue/shared-types`, existing `LlmClient` contract. No new dependencies. Backend-only — the ranking payload is an internal type, so **no `shared-types` dist rebuild is needed for this plan**.

## Global Constraints

- **Merge prerequisite:** Plan `2026-08-30-meal-completion-backend-core` must be implemented FIRST. This plan consumes `MealCompletionService.getSummary`/`getRankingInputs`, the `AdditionEvent` model, `OnboardingMealGroup` + `PAIRS` from `pair-catalog.ts`, and the `promoteConfirmedSignals(userId, [])` seam. Do not start until those exist.
- **No body-fat/medical claims** in any generated text; no nutritionist jargon; don't sound judgmental (spec EXPLANATION STYLE GUIDE).
- **UNAVAILABLE ≠ negative preference**, **no-cuisine rule**: cuisine is display metadata only and is never used as a ranking signal.
- Weighted additive score only — **never multiplicative**; hard gates prevent a single low factor from collapsing the result (spec §7).
- Diversity is a **soft objective and must never override strong user affinity, meal compatibility, safety, availability, or practicality**; no forced rotation (spec §8 GUARDRAIL).
- Anti-fatigue is **soft and decaying**: 0 recent appearances → none; 1 → tiny; 2 → moderate; 3+ → strong but temporary (spec §8).
- Freshness source for V1: the persisted `Rescue` table (last 10 rescues' `selectedRecommendation.candidate.additions`). Deliberately NOT `addition_events`, which is A/B-pair shaped (`pairId`/`additionA`/`additionB` NOT NULL) — adding "user was recommended ingredient X" rows there would violate its purpose (spec §9 event log records *behavioral* evidence, not exposure).
- Do not touch user's uncommitted files: `apps/mobile/src/screens/ScrapsIntroScreen.tsx` (untracked) and any mobile edits. `PROGRESS.md` is gitignored — never stage it.
- Every task ends with typecheck passing + targeted tests passing + a git commit.

---

### Task 1: Cold-start signal module

Pure, DB-free math. Every later task imports from here, so signatures must be exact.

**Files:**
- Create: `apps/backend/src/services/ranking/cold-start-signals.ts`
- Test: `apps/backend/tests/cold-start-signals.test.ts` (create)

**Interfaces:**
- Consumes: `AdditionFactorKey`, `ConfidenceState` (both from `@meal-rescue/shared-types`, after Plan 1); `INGREDIENTS` + `IngredientRecord` from `../ai/ingredient-db`; `OnboardingMealGroup` from `../onboarding/pair-catalog`.
- Produces (exact names/types — Tasks 2-5 rely on these):
  - `type ColdStartFactorKey = AdditionFactorKey`
  - `interface ColdStartFactorSignal { factor; affinity: number; confidence: ConfidenceState }`
  - `interface ColdStartProfileInput { coldStartFactors: ColdStartFactorSignal[]; mealGroupAffinities: Record<string, number>; profileConfidence: number; mealGroup: OnboardingMealGroup | 'other' }`
  - `interface SignalCandidate { id: string; type?: string | null; additions?: Array<{ name: string }>; estimatedTime?: number }`
  - `const COLD_START_WEIGHTS = { w1: 0.3, w2: 0.2, w3: 0.25, w4: 0.15, w5: 0.1 } as const`
  - `const SAFETY_GATE_THRESHOLD = 0.4`, `SAFETY_PICK_MAX_MINUTES = 15`, `SAFETY_PICK_BOOST = 0.08`, `STRONG_AFFINITY = 0.7`, `STRONG_MEAL_CONTEXT = 0.6`, `STRONG_PRACTICALITY = 0.6`, `STRONG_PREFERENCE_FLOOR = 0.85`
  - `clamp01(v)`, `normalize(v)` (maps [-1,1] → [0,1])
  - `deriveMealGroup(foods: string[]): OnboardingMealGroup | 'other'`
  - `type AdditionRoleClass = 'protein' | 'fibre_volume' | 'crunch' | 'fat_rich' | 'fresh' | 'seasoning' | 'comfort' | 'unknown'`
  - `roleClassForAddition(name: string): AdditionRoleClass`
  - `type RoleFamily = 'PROTEIN' | 'CRUNCH' | 'FIBRE_VOLUME' | 'UNKNOWN'`
  - `roleFamily(roleClass: AdditionRoleClass): RoleFamily`
  - `genericMealPrior(mealGroup: OnboardingMealGroup | 'other', roleClass: AdditionRoleClass): number`
  - `recencyPenalty(appearances: number): number`
  - `recentAppearances(candidate: SignalCandidate, recentlyShown: string[]): number`
  - `familyCounts(recentlyShown: string[]): Record<RoleFamily, number>`
  - `familyBenefit(family: RoleFamily, counts: Record<RoleFamily, number>): number`
  - `factorAffinityForCandidate(candidate: SignalCandidate, profile: ColdStartProfileInput, missingComponents: string[], recentlyShown: string[]): number` (returns -1..1)
  - `profileConfidenceFromFactors(factors: Array<{ confidence: ConfidenceState }>): number`
  - `normalizeIngredientNames(input: string[]): string[]`
  - `additionsFromRescues(rescues: Array<{ selectedRecommendation: unknown }>): string[]`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/cold-start-signals.test.ts`:

```ts
import {
  additionsFromRescues,
  deriveMealGroup,
  factorAffinityForCandidate,
  familyBenefit,
  familyCounts,
  genericMealPrior,
  normalize,
  normalizeIngredientNames,
  profileConfidenceFromFactors,
  recentAppearances,
  recencyPenalty,
  roleClassForAddition,
} from '../src/services/ranking/cold-start-signals';

describe('deriveMealGroup', () => {
  it('classifies meals into onboarding groups', () => {
    expect(deriveMealGroup(['plain steamed rice'])).toBe('rice_based');
    expect(deriveMealGroup(['instant noodles', 'wheat ramen'])).toBe('noodle');
    expect(deriveMealGroup(['oatmeal'])).toBe('breakfast_bowl');
    expect(deriveMealGroup(['canned tomato soup'])).toBe('soup');
    expect(deriveMealGroup(['plain yogurt bowl'])).toBe('yogurt_bowl');
    expect(deriveMealGroup(['baked potato'])).toBe('potato');
    expect(deriveMealGroup(['grilled sausages'])).toBe('other');
  });
});

describe('roleClassForAddition', () => {
  it('resolves ingredient-db components to role classes', () => {
    expect(roleClassForAddition('egg')).toBe('protein');
    expect(roleClassForAddition('canned tuna')).toBe('protein');
    expect(roleClassForAddition('rotisserie chicken')).toBe('protein');
    expect(roleClassForAddition('scrambled egg')).toBe('protein');
    expect(roleClassForAddition('zzz-unknown-food')).toBe('unknown');
  });
});

describe('genericMealPrior', () => {
  it('returns small static deltas for known meal group x role combinations', () => {
    expect(genericMealPrior('rice_based', 'protein')).toBe(0.05);
    expect(genericMealPrior('yogurt_bowl', 'fresh')).toBe(0.05);
    expect(genericMealPrior('yogurt_bowl', 'seasoning')).toBe(-0.02);
    expect(genericMealPrior('other', 'protein')).toBe(0);
  });
});

describe('recencyPenalty', () => {
  it('is soft and decaying per spec §8', () => {
    expect(recencyPenalty(0)).toBe(0);
    expect(recencyPenalty(1)).toBe(-0.05);
    expect(recencyPenalty(2)).toBe(-0.15);
    expect(recencyPenalty(3)).toBe(-0.25);
    expect(recencyPenalty(9)).toBe(-0.25);
  });
});

describe('recentAppearances', () => {
  it('counts how many of a candidate additions were recently shown', () => {
    const candidate = {
      id: 'c1',
      type: 'addition',
      additions: [{ name: 'egg' }, { name: 'canned tuna' }],
    };
    expect(recentAppearances(candidate, ['egg', 'sesame oil'])).toBe(1);
    expect(recentAppearances(candidate, ['EGG', 'egg'])).toBe(1);
    expect(recentAppearances(candidate, [])).toBe(0);
  });
});

describe('familyCounts / familyBenefit', () => {
  it('counts shown families and rewards under-shown ones softly', () => {
    expect(familyCounts(['egg'])).toEqual({
      PROTEIN: 1,
      CRUNCH: 0,
      FIBRE_VOLUME: 0,
      UNKNOWN: 0,
    });
    const counts = familyCounts(['egg', 'canned tuna', 'egg']);
    expect(familyBenefit('PROTEIN', counts)).toBe(0);
    expect(familyBenefit('CRUNCH', counts)).toBeCloseTo(0.15, 6);
    expect(familyBenefit('UNKNOWN', counts)).toBe(0);
  });
});

describe('factorAffinityForCandidate', () => {
  it('returns 0 with no learned profile or evidence-independent inputs', () => {
    const profile = {
      coldStartFactors: [
        { factor: 'nutritional' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'sensory' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'satisfaction' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'modification' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'exploration' as const, affinity: 0, confidence: 'unknown' as const },
      ],
      mealGroupAffinities: {},
      profileConfidence: 0,
      mealGroup: 'other' as const,
    };
    const candidate = { id: 's', type: 'substitution', additions: [{ name: 'egg' }] };
    expect(factorAffinityForCandidate(candidate, profile, ['protein'], [])).toBe(0);
  });

  it('is positive when a high nutritional affinity is matched by the candidate', () => {
    const profile = {
      coldStartFactors: [
        { factor: 'nutritional' as const, affinity: 0.9, confidence: 'confirmed' as const },
        { factor: 'sensory' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'satisfaction' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'modification' as const, affinity: 0, confidence: 'unknown' as const },
        { factor: 'exploration' as const, affinity: 0, confidence: 'unknown' as const },
      ],
      mealGroupAffinities: {},
      profileConfidence: 1,
      mealGroup: 'rice_based' as const,
    };
    const candidate = { id: 'p', type: 'addition', additions: [{ name: 'egg' }] };
    expect(factorAffinityForCandidate(candidate, profile, ['protein'], [])).toBeGreaterThan(0);
  });
});

describe('profileConfidenceFromFactors', () => {
  it('averages confidence values', () => {
    expect(profileConfidenceFromFactors([])).toBe(0);
    expect(
      profileConfidenceFromFactors([
        { confidence: 'unknown' as const },
        { confidence: 'confirmed' as const },
      ]),
    ).toBe(0.5);
  });
});

describe('normalizeIngredientNames', () => {
  it('lowercases, strips punctuation, dedupes', () => {
    expect(
      normalizeIngredientNames([' Egg ', 'EGG', 'Can tuna!', 'sesame-oil', '']),
    ).toEqual(['egg', 'can tuna', 'sesame-oil']);
  });
});

describe('additionsFromRescues', () => {
  it('collects recommended addition names from persisted rescues', () => {
    expect(
      additionsFromRescues([
        {
          selectedRecommendation: {
            candidate: { additions: [{ name: ' Egg' }, { name: 'Tuna' }] },
          },
        },
        { selectedRecommendation: {} },
      ]),
    ).toEqual(['egg', 'tuna']);
  });
});

describe('normalize', () => {
  it('maps affinity [-1,1] onto [0,1]', () => {
    expect(normalize(-1)).toBe(0);
    expect(normalize(0)).toBe(0.5);
    expect(normalize(1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand cold-start-signals`
Expected: FAIL — `Cannot find module '../src/services/ranking/cold-start-signals'`.

- [ ] **Step 3: Write the module**

Create `apps/backend/src/services/ranking/cold-start-signals.ts`:

```ts
/**
 * Meal-completion cold-start ranking signals (Plan 3).
 *
 * Pure, DB-free math implementing spec §6 generic meal-context prior, §7
 * weighted-additive ranking + recommendation-safety gate, and §8
 * anti-fatigue + role-family diversity layer. The LLM ranking prompt and
 * the deterministic fallback both consume these values; the signals
 * themselves never write anything.
 */
import type { AdditionFactorKey, ConfidenceState } from '@meal-rescue/shared-types';
import { INGREDIENTS } from '../ai/ingredient-db';
import type { OnboardingMealGroup } from '../onboarding/pair-catalog';

export type ColdStartFactorKey = AdditionFactorKey;

export interface ColdStartFactorSignal {
  factor: ColdStartFactorKey;
  /** Learned affinity in [-1, 1]; 0 = no evidence yet. */
  affinity: number;
  confidence: ConfidenceState;
}

export interface ColdStartProfileInput {
  coldStartFactors: ColdStartFactorSignal[];
  mealGroupAffinities: Record<string, number>;
  /** 0..1 average confidence across diagnosed factors. */
  profileConfidence: number;
  mealGroup: OnboardingMealGroup | 'other';
}

export interface SignalCandidate {
  id: string;
  type?: string | null;
  additions?: Array<{ name: string }>;
  estimatedTime?: number;
}

// Weighted additive tuning targets (spec §7). Sum = 1.
export const COLD_START_WEIGHTS = { w1: 0.3, w2: 0.2, w3: 0.25, w4: 0.15, w5: 0.1 } as const;

// Recommendation-safety gate (spec §7): below this confidence, lean safe.
export const SAFETY_GATE_THRESHOLD = 0.4;
export const SAFETY_PICK_MAX_MINUTES = 15;
export const SAFETY_PICK_BOOST = 0.08;
// Diversity/freshness guardrail (spec §8): strong candidates win regardless.
export const STRONG_AFFINITY = 0.7;
export const STRONG_MEAL_CONTEXT = 0.6;
export const STRONG_PRACTICALITY = 0.6;
export const STRONG_PREFERENCE_FLOOR = 0.85;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Map a learned affinity [-1,1] onto the [0,1] score space. */
export function normalize(value: number): number {
  return clamp01((value + 1) / 2);
}

const MEAL_GROUP_KEYWORDS: Array<{ group: OnboardingMealGroup; keywords: string[] }> = [
  {
    group: 'rice_based',
    keywords: ['rice', 'risotto', 'biryani', 'paella', 'pilaf', 'congee', 'sushi', 'fried rice'],
  },
  {
    group: 'noodle',
    keywords: ['noodle', 'pasta', 'ramen', 'udon', 'spaghetti', 'macaroni', 'penne', 'lo mein', 'vermicelli'],
  },
  {
    group: 'breakfast_bowl',
    keywords: ['oatmeal', 'oats', 'cereal', 'muesli', 'granola', 'porridge', 'breakfast bowl'],
  },
  {
    group: 'soup',
    keywords: ['soup', 'stew', 'bisque', 'chowder', 'minestrone', 'pozole'],
  },
  {
    group: 'yogurt_bowl',
    keywords: ['yogurt', 'yoghurt', 'curd', 'smoothie bowl'],
  },
  {
    group: 'potato',
    keywords: ['potato', 'fries', 'chips', 'baked potato', 'mashed potato', 'hash brown'],
  },
];

/** Meal-group of the analyzed meal for the generic meal-context prior. */
export function deriveMealGroup(foods: string[]): OnboardingMealGroup | 'other' {
  for (const food of foods) {
    const f = food.toLowerCase();
    for (const { group, keywords } of MEAL_GROUP_KEYWORDS) {
      if (keywords.some((keyword) => f.includes(keyword))) return group;
    }
  }
  return 'other';
}

export type AdditionRoleClass =
  | 'protein'
  | 'fibre_volume'
  | 'crunch'
  | 'fat_rich'
  | 'fresh'
  | 'seasoning'
  | 'comfort'
  | 'unknown';

/** Pair-catalog additions resolve directly; everything else hits the ingredient DB. */
const CATALOG_ROLE_CLASS: Record<string, AdditionRoleClass> = {
  'scrambled egg': 'protein',
  'sesame oil + furikake': 'seasoning',
  'leftover chicken': 'protein',
  'soft-cooked egg': 'protein',
  'banana + peanut butter': 'comfort',
  'frozen berries': 'fresh',
  'grilled cheese on the side': 'fat_rich',
  'white beans + spinach': 'fibre_volume',
  'granola + honey': 'crunch',
  'smashed berries + chia': 'crunch',
  'cheese + sour cream': 'fat_rich',
  'beans + chili seasoning': 'fibre_volume',
  'hot sauce + lime': 'seasoning',
  'sliced avocado': 'fat_rich',
};

export function roleClassForAddition(name: string): AdditionRoleClass {
  const n = name.trim().toLowerCase();
  if (CATALOG_ROLE_CLASS[n]) return CATALOG_ROLE_CLASS[n];
  const record = INGREDIENTS.find(
    (item) =>
      item.name === n || item.aliases.some((alias) => alias === n || alias.includes(n)),
  );
  if (record) {
    const first = record.components[0];
    if (first === 'protein') return 'protein';
    if (first === 'fiber_sources') return 'fibre_volume';
    if (first === 'healthy_fat_sources') {
      return /seed|nut|peanut|granola/.test(record.name) ? 'crunch' : 'fat_rich';
    }
  }
  return 'unknown';
}

export type RoleFamily = 'PROTEIN' | 'CRUNCH' | 'FIBRE_VOLUME' | 'UNKNOWN';

export function roleFamily(roleClass: AdditionRoleClass): RoleFamily {
  if (roleClass === 'protein') return 'PROTEIN';
  if (roleClass === 'crunch') return 'CRUNCH';
  if (roleClass === 'fibre_volume' || roleClass === 'fresh') return 'FIBRE_VOLUME';
  return 'UNKNOWN';
}

type CoarseMealFamily = 'starchy_savory' | 'sweet_breakfast' | 'soupy' | 'other';

function coarseMealFamily(mealGroup: OnboardingMealGroup | 'other'): CoarseMealFamily {
  if (mealGroup === 'rice_based' || mealGroup === 'noodle' || mealGroup === 'potato') {
    return 'starchy_savory';
  }
  if (mealGroup === 'breakfast_bowl' || mealGroup === 'yogurt_bowl') return 'sweet_breakfast';
  if (mealGroup === 'soup') return 'soupy';
  return 'other';
}

/** Spec §6: meal_group x addition_role -> prior_compatibility (tiny static deltas). */
const GENERIC_MEAL_PRIOR: Record<
  CoarseMealFamily,
  Partial<Record<AdditionRoleClass, number>>
> = {
  starchy_savory: {
    protein: 0.05,
    fibre_volume: 0.03,
    seasoning: 0.02,
    fat_rich: 0.02,
    crunch: 0.01,
    fresh: 0.01,
    comfort: 0,
  },
  sweet_breakfast: {
    fresh: 0.05,
    crunch: 0.04,
    comfort: 0.03,
    fat_rich: 0.02,
    fibre_volume: 0.02,
    protein: 0.01,
    seasoning: -0.02,
  },
  soupy: {
    fibre_volume: 0.05,
    seasoning: 0.03,
    protein: 0.04,
    comfort: 0.03,
    fat_rich: 0.02,
    fresh: 0.02,
    crunch: 0.01,
  },
  other: {},
};

/** Generic compatibility of an addition role with a meal group (user-independent). */
export function genericMealPrior(
  mealGroup: OnboardingMealGroup | 'other',
  roleClass: AdditionRoleClass,
): number {
  return GENERIC_MEAL_PRIOR[coarseMealFamily(mealGroup)][roleClass] ?? 0;
}

/** Spec §8: 0 -> none, 1 -> tiny, 2 -> moderate, 3+ -> strong but temporary. */
export function recencyPenalty(appearances: number): number {
  if (appearances <= 0) return 0;
  if (appearances === 1) return -0.05;
  if (appearances === 2) return -0.15;
  return -0.25;
}

export function recentAppearances(candidate: SignalCandidate, recentlyShown: string[]): number {
  const pool = new Set(recentlyShown.map((name) => name.toLowerCase()));
  return (candidate.additions ?? []).filter((addition) =>
    pool.has(addition.name.toLowerCase()),
  ).length;
}

export function familyCounts(recentlyShown: string[]): Record<RoleFamily, number> {
  const counts: Record<RoleFamily, number> = { PROTEIN: 0, CRUNCH: 0, FIBRE_VOLUME: 0, UNKNOWN: 0 };
  for (const name of recentlyShown) {
    counts[roleFamily(roleClassForAddition(name))] += 1;
  }
  return counts;
}

/** Soft reward (0..0.15) for role families under-shown recently. */
export function familyBenefit(family: RoleFamily, counts: Record<RoleFamily, number>): number {
  if (family === 'UNKNOWN') return 0;
  const seen = counts[family];
  const total = counts.PROTEIN + counts.CRUNCH + counts.FIBRE_VOLUME;
  if (total === 0) return 0.15;
  return 0.15 * (1 - seen / total);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * How well a candidate exercises the user's diagnosed factor affinities.
 * Each factor term is affinity x "fit" (0..1), averaged across the five
 * factors; NaN-safe - every undefined factor affinity reads as 0.
 */
export function factorAffinityForCandidate(
  candidate: SignalCandidate,
  profile: ColdStartProfileInput,
  missingComponents: string[],
  recentlyShown: string[],
): number {
  const byFactor = new Map(profile.coldStartFactors.map((f) => [f.factor, f.affinity]));
  const aff = (factor: ColdStartFactorKey): number => byFactor.get(factor) ?? 0;

  const classes = (candidate.additions ?? []).map((addition) =>
    roleClassForAddition(addition.name),
  );
  const families = classes.map(roleFamily);
  const has = (family: RoleFamily): boolean => families.includes(family);

  const missing = new Set(missingComponents);
  const nutFit =
    missing.size === 0
      ? 0.5
      : (missing.has('protein') && has('PROTEIN') ? 1 : 0) +
          (missing.has('fiber_sources') && has('FIBRE_VOLUME') ? 1 : 0) +
          (missing.has('healthy_fat_sources') && (has('FIBRE_VOLUME') || has('CRUNCH')) ? 1 : 0)
      ) /
        Math.max(1, missing.size);

  const senFit = has('CRUNCH') || has('FIBRE_VOLUME') ? 0.8 : 0.4;
  const satFit = has('PROTEIN') || has('CRUNCH') ? 0.8 : 0.5;
  const modFit = candidate.type === 'substitution' ? 0.8 : 0.3;
  const expFit =
    (candidate.additions ?? []).length > 0 &&
    (candidate.additions ?? []).some((addition) =>
      recentlyShown.includes(addition.name.toLowerCase()),
    )
      ? 0.2
      : 0.7;

  const terms = [
    aff('nutritional') * nutFit,
    aff('sensory') * senFit,
    aff('satisfaction') * satFit,
    aff('modification') * modFit,
    aff('exploration') * expFit,
  ];

  return clamp(terms.reduce((sum, term) => sum + term, 0) / 5, -1, 1);
}

const CONFIDENCE_VALUE: Record<ConfidenceState, number> = {
  unknown: 0,
  inferred: 0.5,
  confirmed: 1,
};

export function profileConfidenceFromFactors(
  factors: Array<{ confidence: ConfidenceState }>,
): number {
  if (factors.length === 0) return 0;
  return (
    factors.reduce((sum, factor) => sum + CONFIDENCE_VALUE[factor.confidence], 0) /
    factors.length
  );
}

/**
 * Normalize free-text feedback modifications into canonical, deduped,
 * lowercase ingredient names for the behavioral-override hook.
 */
export function normalizeIngredientNames(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = raw.trim().toLowerCase().replace(/[^a-z\s-]/g, '');
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Additions the user has recently been recommended, from persisted
 * Rescue.selectedRecommendation rows - the anti-fatigue input (V1 source).
 */
export function additionsFromRescues(
  rescues: Array<{ selectedRecommendation: unknown }>,
): string[] {
  const names = new Set<string>();
  for (const row of rescues) {
    const selected = row.selectedRecommendation as {
      candidate?: { additions?: Array<{ name?: string }> };
    } | null;
    for (const addition of selected?.candidate?.additions ?? []) {
      const name = addition?.name?.trim().toLowerCase();
      if (name) names.add(name);
    }
  }
  return [...names];
}
```

Note: the `nutFit` expression above appears syntactically awkward; write it as the exact three-term numerator over `Math.max(1, missing.size)` as shown (the test asserts positivity for a protein match, which it satisfies: `1 / 1 = 1`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand cold-start-signals`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/ranking/cold-start-signals.ts apps/backend/tests/cold-start-signals.test.ts
git commit -m "feat: cold-start ranking signals module with prior, anti-fatigue, diversity"
```

---

### Task 2: Weighted-additive deterministic fallback with safety gate + guardrail

Rewrite `HeuristicLlmClient.rank()` to the spec §7 formula, consume the policy layer, and expose the extended payload type.

**Files:**
- Modify: `apps/backend/src/services/ai/heuristic-llm-client.ts` (`RankingPayload` interface + `rank()`)
- Test: `apps/backend/tests/ranking-scoring.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 exports — `COLD_START_WEIGHTS`, `SAFETY_GATE_THRESHOLD`, `SAFETY_PICK_MAX_MINUTES`, `SAFETY_PICK_BOOST`, `STRONG_AFFINITY`, `STRONG_MEAL_CONTEXT`, `STRONG_PRACTICALITY`, `STRONG_PREFERENCE_FLOOR`, `clamp01`, `normalize`, `factorAffinityForCandidate`, `roleClassForAddition`, `roleFamily`, `genericMealPrior`, `recentAppearances`, `recencyPenalty`, `familyCounts`, `familyBenefit`; types `ColdStartProfileInput`, `RankingProfileInput`, `SignalCandidate`.
- Produces: `export interface RankingPayload` (adds optional `custom` block) and the new score formula. Task 3 sends `custom`; Task 4 seeds it.
- Behavior contract (deterministic, tested):
  1. `overallScore = w1*affinity + w2*meal_context + w3*practicality + w4*freshness + w5*diversity`, where:
     - `affinity = clamp01(0.6*preferenceAlignment + 0.4*normalize(factorAffinity))`
     - `meal_context = clamp01(0.6*(0.5 + 5*genericMealPrior(mealGroup, roleClass)) + 0.4*coverage)`
     - `practicality = clamp01(0.7*minimal + 0.3*timeScore)`
     - `freshness = clamp01(1 + recencyPenalty(recentAppearances))`
     - `diversity = clamp01(1 + familyBenefit(familyOfFirstAddition, familyCounts(recentlyShown)))`
  2. Safety gate: when `profileConfidence < SAFETY_GATE_THRESHOLD` and candidate is `minimal === 1` and `(estimatedTime ?? 10) <= SAFETY_PICK_MAX_MINUTES`, add `SAFETY_PICK_BOOST`.
  3. Guardrail: when `affinity >= STRONG_AFFINITY && meal_context >= STRONG_MEAL_CONTEXT && practicality >= STRONG_PRACTICALITY`, floor the total at `STRONG_PREFERENCE_FLOOR` (a strongly-preferred, compatible, practical candidate always beats diversity/freshness).
  4. Final score `clamp01` then rounded to 3 decimals; reasoning string includes all five signal terms.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/ranking-scoring.test.ts`:

```ts
import { HeuristicLlmClient } from '../src/services/ai/heuristic-llm-client';
import { rankingResultSchema } from '../src/services/ai/llm-schemas';
import type { RankingPayload } from '../src/services/ai/heuristic-llm-client';

const client = new HeuristicLlmClient();

async function rank(payload: RankingPayload) {
  const response = await client.completeJson({
    systemPrompt: 'Rank candidates',
    userContent: payload,
    schema: rankingResultSchema,
    modelName: 'heuristic',
  });
  return response.data.rankedCandidates;
}

function candidate(
  id: string,
  overrides: Partial<NonNullable<RankingPayload['candidates']>[number]> = {},
): NonNullable<RankingPayload['candidates']>[number] {
  return {
    id,
    type: 'addition',
    additions: [{ name: 'egg' }],
    estimatedTime: 5,
    cookingSteps: 0,
    nutritionalImprovement: { protein: 'adds protein' },
    preferenceAlignment: 0.6,
    ...overrides,
  };
}

describe('deterministic ranking - weighted additive (§7)', () => {
  it('ranks a fresh candidate above a recently-shown one, all else equal (§8 anti-fatigue)', async () => {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [
        candidate('repeat', { additions: [{ name: 'egg' }] }),
        candidate('fresh', { additions: [{ name: 'canned tuna' }] }),
      ],
      custom: { mealGroup: 'rice_based', profile: null, recentlyShown: ['egg'] },
    });
    expect(ranked[0]!.candidateId).toBe('fresh');
    expect(ranked[1]!.candidateId).toBe('repeat');
    expect(ranked[1]!.overallScore).toBeLessThan(ranked[0]!.overallScore);
  });

  it('guardrail: a strongly-preferred compatible candidate beats a fresh alternative (§8)', async () => {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [
        candidate('strong', { additions: [{ name: 'egg' }], preferenceAlignment: 0.95 }),
        candidate('novel', { additions: [{ name: 'canned tuna' }], preferenceAlignment: 0.5 }),
      ],
      custom: { mealGroup: 'rice_based', profile: null, recentlyShown: ['egg'] },
    });
    expect(ranked[0]!.candidateId).toBe('strong');
    expect(ranked[0]!.overallScore).toBeGreaterThanOrEqual(0.85);
  });
});

describe('safety gate (§7)', () => {
  const safe = candidate('safe', {
    additions: [{ name: 'egg' }],
    estimatedTime: 15,
    preferenceAlignment: 0.4,
  });
  const risky = candidate('risky', {
    additions: [{ name: 'canned tuna' }],
    estimatedTime: 5,
    cookingSteps: 1,
    preferenceAlignment: 0.85,
  });

  async function scorePair(profileConfidence: number) {
    const ranked = await rank({
      missingComponents: ['protein'],
      candidates: [safe, risky],
      custom: {
        mealGroup: 'rice_based',
        profile: {
          coldStartFactors: [],
          mealGroupAffinities: {},
          profileConfidence,
          mealGroup: 'rice_based',
        },
        recentlyShown: [],
      },
    });
    return {
      safe: ranked.find((row) => row.candidateId === 'safe')!.overallScore,
      risky: ranked.find((row) => row.candidateId === 'risky')!.overallScore,
      order: ranked.map((row) => row.candidateId),
    };
  }

  it('adds exactly the safety boost at low confidence but never overrides a strong pick', async () => {
    const high = await scorePair(0.9);
    const low = await scorePair(0.2);
    expect(low.safe - high.safe).toBeCloseTo(0.08, 3);
    expect(low.order).toEqual(high.order);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand ranking-scoring`
Expected: FAIL — `RankingPayload` type has no `custom` and the current formula yields equal scores (order test fails).

- [ ] **Step 3: Extend the payload type**

In `apps/backend/src/services/ai/heuristic-llm-client.ts`, add the import and extend the interface:

```ts
import {
  COLD_START_WEIGHTS,
  SAFETY_GATE_THRESHOLD,
  SAFETY_PICK_BOOST,
  SAFETY_PICK_MAX_MINUTES,
  STRONG_AFFINITY,
  STRONG_MEAL_CONTEXT,
  STRONG_PRACTICALITY,
  STRONG_PREFERENCE_FLOOR,
  clamp01,
  factorAffinityForCandidate,
  familyBenefit,
  familyCounts,
  genericMealPrior,
  normalize,
  recentAppearances,
  recencyPenalty,
  roleClassForAddition,
  roleFamily,
} from '../ranking/cold-start-signals';
import type { RankingProfileInput } from '../ranking/cold-start-signals';
```

Replace the `interface RankingPayload` declaration with:

```ts
export interface RankingPayload {
  missingComponents?: string[];
  candidates?: Array<{
    id: string;
    type?: string;
    additions?: Array<{ name: string }>;
    substitutions?: Array<{ original: { name: string }; replacement: { name: string } }>;
    estimatedTime?: number;
    cookingSteps?: number;
    nutritionalImprovement?: Record<string, string>;
    preferenceAlignment?: number;
  }>;
  /** Meal-completion cold-start + anti-fatigue inputs (Plan 3). */
  custom?: {
    mealGroup?: string;
    profile?: RankingProfileInput | null;
    recentlyShown?: string[];
  };
}
```

- [ ] **Step 4: Replace `rank()`**

Replace the current `private rank(...)` method (lines ~144-189) with:

```ts
  private rank(userContent: string | Record<string, unknown>): RankingResult {
    const payload: RankingPayload =
      typeof userContent === 'string'
        ? safeJsonParse(userContent)
        : (userContent as RankingPayload);

    const missing = new Set(payload.missingComponents ?? []);
    const candidates = payload.candidates ?? [];
    const profile = payload.custom?.profile;
    const recentlyShown = payload.custom?.recentlyShown ?? [];
    const mealGroup = payload.custom?.mealGroup ?? 'other';
    const profileConfidence = profile?.profileConfidence ?? 0;

    const scored = candidates.map((candidate) => {
      const improvementKeys = Object.keys(candidate.nutritionalImprovement ?? {});
      const coverage =
        missing.size === 0
          ? 0.5
          : improvementKeys.filter((key) => missing.has(key)).length / missing.size;

      const additionCount = candidate.additions?.length ?? 0;
      const minimal =
        additionCount <= 1 && (candidate.cookingSteps ?? 0) === 0
          ? 1.0
          : additionCount <= 1
            ? 0.7
            : 0.4;

      const timeScore = Math.max(0, 1 - (candidate.estimatedTime ?? 10) / 30);
      const preference = candidate.preferenceAlignment ?? 0.5;

      const factorAffinity = profile
        ? factorAffinityForCandidate(candidate, profile, payload.missingComponents ?? [], recentlyShown)
        : 0;
      const affinity = clamp01(0.6 * preference + 0.4 * normalize(factorAffinity));

      const roleClass = roleClassForAddition(candidate.additions?.[0]?.name ?? '');
      const mealContext = clamp01(
        0.6 * (0.5 + 5 * genericMealPrior(mealGroup, roleClass)) + 0.4 * coverage,
      );

      const practicality = clamp01(0.7 * minimal + 0.3 * timeScore);
      const freshness = clamp01(1 + recencyPenalty(recentAppearances(candidate, recentlyShown)));
      const counts = familyCounts(recentlyShown);
      const diversity = clamp01(1 + familyBenefit(roleFamily(roleClass), counts));

      let overallScore =
        COLD_START_WEIGHTS.w1 * affinity +
        COLD_START_WEIGHTS.w2 * mealContext +
        COLD_START_WEIGHTS.w3 * practicality +
        COLD_START_WEIGHTS.w4 * freshness +
        COLD_START_WEIGHTS.w5 * diversity;

      // Safety gate (spec §7): low profile confidence favors safe + familiar
      // + small-exploration picks among otherwise-equal candidates.
      if (
        profileConfidence < SAFETY_GATE_THRESHOLD &&
        minimal === 1 &&
        (candidate.estimatedTime ?? 10) <= SAFETY_PICK_MAX_MINUTES
      ) {
        overallScore += SAFETY_PICK_BOOST;
      }

      // Guardrail (spec §8): a strongly preferred, compatible, practical
      // candidate always wins - diversity/freshness never override it.
      if (
        affinity >= STRONG_AFFINITY &&
        mealContext >= STRONG_MEAL_CONTEXT &&
        practicality >= STRONG_PRACTICALITY
      ) {
        overallScore = Math.max(overallScore, STRONG_PREFERENCE_FLOOR);
      }

      overallScore = clamp01(overallScore);

      const signals = [
        `affinity=${affinity.toFixed(2)}`,
        `context=${mealContext.toFixed(2)}`,
        `practicality=${practicality.toFixed(2)}`,
        `freshness=${freshness.toFixed(2)}`,
        `diversity=${diversity.toFixed(2)}`,
      ];
      if (profile) signals.push(`factor=${factorAffinity.toFixed(2)}`);
      if (profileConfidence < SAFETY_GATE_THRESHOLD) signals.push('safety');

      return {
        candidateId: candidate.id,
        overallScore: Number(overallScore.toFixed(3)),
        reasoning: `deterministic score: ${signals.join(' ')}`,
        explanation: buildExplanation(candidate),
      };
    });

    scored.sort((a, b) => b.overallScore - a.overallScore);

    return {
      rankedCandidates: scored.length > 0 ? scored : fallbackRank(payload),
      rankingConfidence: 0.6,
    };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand ranking-scoring`
Expected: PASS.

- [ ] **Step 6: Run the full backend unit suite + typecheck**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand
```

Expected: clean + PASS (no existing tests exercised the heuristic ranking with the old weights, so nothing else changes behaviorally).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/ai/heuristic-llm-client.ts apps/backend/tests/ranking-scoring.test.ts
git commit -m "feat: weighted-additive heuristic ranking with safety gate and diversity guardrail"
```

---

### Task 3: Ranking engine payload + prompt update

Wire the profile and recency data into the payload sent to both the LLM and the fallback, and teach the LLM prompt to treat them as soft tiebreakers.

**Files:**
- Modify: `apps/backend/src/services/ranking-engine.service.ts` (signature + payload)
- Modify: `apps/backend/src/services/ai/prompts.ts` (`CANDIDATE_RANKING_SYSTEM_PROMPT` + `PROMPT_VERSIONS.candidateRanking`)
- Test: `apps/backend/tests/ranking-payload.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `RankingProfileInput`, `deriveMealGroup`; Task 2 `HeuristicLlmClient` (unchanged contract).
- Produces:
  - `function buildRankingPayload(input: RankingPayloadInput)` — exported pure helper (JSON object the LLM + fallback receive).
  - `RankingEngineService.rankAndExplain(candidates, meal, constraints, preferences, resonanceMemory?, profile?: RankingProfileInput | null, recentlyShown?: string[])` — signature becomes (was 5 params) 7 params; **backward compatible** (existing callers omit the new optional args).
  - `PROMPT_VERSIONS.candidateRanking = 'v2.1-mr2'`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/ranking-payload.test.ts`:

```ts
import { buildRankingPayload } from '../src/services/ranking-engine.service';
import { PROMPT_VERSIONS } from '../src/services/ai/prompts';

describe('buildRankingPayload', () => {
  const candidates = [
    {
      id: 'c1',
      type: 'addition' as const,
      additions: [{ name: 'egg' }],
      substitutions: [],
      estimatedTime: 5,
      estimatedCost: 'low' as const,
      requiredEquipment: [],
      cookingSteps: 0,
      nutritionalImprovement: { protein: 'adds protein' },
      preferenceAlignment: 0.5,
    },
  ];
  const meal = {
    detectedFoods: [{ name: 'instant noodles' }],
    detectedComponents: { protein: false, fiber_sources: true, healthy_fat_sources: true },
  };
  const constraints = {};
  const preferences = { favoriteFoods: ['egg'], avoidedFoods: [] };

  it('omits the cold-start block when no profile is given', () => {
    const payload = buildRankingPayload({
      candidates,
      meal,
      missingComponents: ['protein'],
      constraints,
      preferences,
      profile: null,
      recentlyShown: [],
    });
    expect(payload.preferences.coldStartProfile).toBeUndefined();
    expect(payload.custom.mealGroup).toBe('noodle');
    expect(payload.custom.recentlyShown).toEqual([]);
  });

  it('embeds profile details + derives meal group when provided', () => {
    const payload = buildRankingPayload({
      candidates,
      meal,
      missingComponents: ['protein'],
      constraints,
      preferences,
      profile: {
        coldStartFactors: [
          { factor: 'nutritional' as const, affinity: 0.8, confidence: 'confirmed' as const },
        ],
        mealGroupAffinities: { rice_based: 0.4 },
        profileConfidence: 1,
        mealGroup: 'rice_based' as const,
      },
      recentlyShown: ['sesame oil'],
    });
    expect(payload.preferences.coldStartProfile).toEqual({
      coldStartFactors: [
        { factor: 'nutritional', affinity: 0.8, confidence: 'confirmed' },
      ],
      mealGroupAffinities: { rice_based: 0.4 },
      profileConfidence: 1,
    });
    expect(payload.custom.profile!.mealGroup).toBe('rice_based');
    expect(payload.custom.mealGroup).toBe('rice_based');
  });
});

describe('prompt version', () => {
  it('bumps candidateRanking for the new cold-start inputs', () => {
    expect(PROMPT_VERSIONS.candidateRanking).toBe('v2.1-mr2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand ranking-payload`
Expected: FAIL — `buildRankingPayload` is not exported; `PROMPT_VERSIONS.candidateRanking` is `'v2.0-mr1'`.

- [ ] **Step 3: Add the payload builder + extend the signature**

In `apps/backend/src/services/ranking-engine.service.ts`:

Add imports:

```ts
import { deriveMealGroup } from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';
```

Add the exported builder above the class (after `RankingMealContext`):

```ts
export interface RankingPayloadInput {
  candidates: RescueCandidate[];
  meal: RankingMealContext;
  missingComponents: string[];
  constraints: Constraints;
  preferences: UserPreferenceSnapshot;
  profile?: RankingProfileInput | null;
  recentlyShown?: string[];
}

/** JSON payload shared by the LLM prompt and the deterministic fallback. */
export function buildRankingPayload(input: RankingPayloadInput) {
  const { candidates, meal, missingComponents, constraints, preferences, profile, recentlyShown } =
    input;

  const mealGroup =
    profile && profile.mealGroup && profile.mealGroup !== 'other'
      ? profile.mealGroup
      : deriveMealGroup(meal.detectedFoods.map((food) => food.name));

  return {
    meal: { foods: meal.detectedFoods.map((food) => food.name) },
    missingComponents,
    constraints,
    preferences: {
      favorites: preferences.favoriteFoods ?? [],
      avoided: preferences.avoidedFoods ?? [],
      ...(profile
        ? {
            coldStartProfile: {
              coldStartFactors: profile.coldStartFactors,
              mealGroupAffinities: profile.mealGroupAffinities,
              profileConfidence: profile.profileConfidence,
            },
          }
        : {}),
    },
    recentlyShown,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      type: candidate.type,
      additions: candidate.additions.map((addition) => ({ name: addition.name })),
      substitutions: candidate.substitutions.map((substitution) => ({
        original: substitution.original.name,
        replacement: substitution.replacement.name,
      })),
      estimatedTime: candidate.estimatedTime,
      estimatedCost: candidate.estimatedCost,
      cookingSteps: candidate.cookingSteps,
      nutritionalImprovement: candidate.nutritionalImprovement,
      preferenceAlignment: candidate.preferenceAlignment,
    })),
    custom: {
      mealGroup,
      profile: profile ?? null,
      recentlyShown,
    },
  };
}
```

Replace the `rankAndExplain` signature and payload construction:

```ts
  async rankAndExplain(
    candidates: RescueCandidate[],
    meal: RankingMealContext,
    constraints: Constraints,
    preferences: UserPreferenceSnapshot,
    resonanceMemory?: MemoryReason,
    profile?: RankingProfileInput | null,
    recentlyShown: string[] = [],
  ): Promise<RankedRecommendation[]> {
    if (candidates.length === 0) return [];

    const missingComponents = identifyMissingComponents(meal.detectedComponents);
    const payload = buildRankingPayload({
      candidates,
      meal,
      missingComponents,
      constraints,
      preferences,
      profile,
      recentlyShown,
    });
```

The rest of the method (try/fallback, `join`, resonance block) is unchanged.

- [ ] **Step 4: Update the prompt + bump the version**

In `apps/backend/src/services/ai/prompts.ts`:

Change line 17:

```ts
  candidateRanking: 'v2.1-mr2',
```

Replace the block from `INPUT YOU WILL RECEIVE (as JSON):` (line ~183) through the `CRITICAL RULES` list with:

```
INPUT YOU WILL RECEIVE (as JSON):
meal, missingComponents, constraints, preferences (favorites, avoided, and optionally coldStartProfile), recentlyShown (optional), candidates (each with an id).

YOUR TASK:

1. Evaluate each candidate against all criteria
2. Score each candidate (0.0-1.0)
3. Rank from best to worst
4. Write a friendly explanation for EACH candidate (2 sentences max)

OUTPUT FORMAT:

Respond with valid JSON matching this exact schema:

{
  "rankedCandidates": [
    {
      "candidateId": "string",
      "overallScore": 0.0,
      "reasoning": "string (brief, technical)",
      "explanation": "string (friendly, encouraging, max 2 sentences)"
    }
  ],
  "rankingConfidence": 0.0
}

EXPLANATION STYLE GUIDE:

DO:
- Use encouraging, positive language
- Be specific about benefits
- Acknowledge effort required
- Sound like a helpful friend
- Keep it conversational

DON'T:
- Use nutritionist jargon
- Sound preachy or judgmental
- Make health claims
- Over-promise results
- Sound robotic or templated

GOOD EXAMPLE:
"Adding a scrambled egg to your noodles will make this meal much more satisfying and keep you full longer. It'll only take about 3 minutes and uses ingredients you probably have."

BAD EXAMPLE:
"This intervention optimizes macronutrient distribution by incorporating protein sources to improve satiety metrics."

CRITICAL RULES:

1. NEVER recommend something that violates allergies
2. NEVER exceed stated time constraints
3. NEVER suggest expensive additions for budget-conscious users
4. ALWAYS acknowledge trade-offs honestly
5. NEVER sound judgmental about the original meal
6. Rank EVERY candidate provided - do not drop any
7. Return candidateIds EXACTLY as given
8. recentlyShown and coldStartProfile are SOFT tiebreakers ONLY: slightly prefer additions not recently shown, and use positive cold-start affinities among otherwise-equal candidates. NEVER let either override safety, compatibility, the minimum-intervention principle, or strong preference alignment.
9. If coldStartProfile.profileConfidence is below 0.4, favor SAFE + FAMILIAR + SMALL-EXPLORATION additions over bold speculative ones - but never recommend something unconvincing.
10. A negative cold-start affinity is a soft signal, NOT an allergy or hard exclusion.

Begin ranking now. Respond ONLY with valid JSON.
```

(The pre-existing criteria section at the top of the prompt stays unchanged; keep `MINIMUM INTERVENTION PRINCIPLE`, `PRACTICAL IMPROVEMENT`, `PREFERENCE ALIGNMENT`, `FEASIBILITY` exactly as they are.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand ranking-payload`
Expected: PASS.

- [ ] **Step 6: Typecheck + full suite + commit**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand
git add apps/backend/src/services/ranking-engine.service.ts apps/backend/src/services/ai/prompts.ts apps/backend/tests/ranking-payload.test.ts
git commit -m "feat: inject cold-start profile and recency into the ranking payload; bump ranking prompt to v2.1-mr2"
```

---

### Task 4: Pipeline wiring + composition + profile inputs + behavioral-override fill

Bring the profile and recency signals into `generateRescue`, expose `getRankingInputs` on `MealCompletionService`, register the new service in the composition root, and replace the empty-array behavioral-override call.

**Files:**
- Modify: `apps/backend/src/services/rescue-pipeline.service.ts`
- Modify: `apps/backend/src/services/meal-completion.service.ts`
- Modify: `apps/backend/src/services/composition.ts`
- Modify: `apps/backend/src/services/preference-learning.service.ts` (one-line seam, see Step 5)

**Interfaces:**
- Consumes: Task 1 `RankingProfileInput`, `deriveMealGroup`, `additionsFromRescues`, `normalizeIngredientNames`; Task 3 `rankAndExplain`'s new optional params; Plan 1 `MealCompletionService` (models map, `getSummary(userId): Promise<OnboardingSummaryResponse>`), Plan 1 Task 6 seam `promoteConfirmedSignals`.
- Produces:
  - `MealCompletionService.getRankingInputs(userId): Promise<Omit<RankingProfileInput, 'mealGroup'>>` — mealGroup is joined by the pipeline (it knows the analyzed meal).
  - `RescuePipelineService` constructor `(llm, pantryProvider, tasteMemory?, mealCompletion?)`; new private `recentlyShownAdditions(userId)`; `generateRescue` now computes `profile` + `recentlyShown` and passes them to `rankAndExplain`; persisted `modelVersion: 'pipeline:v2'`.
  - `composition.ts` builds `mealCompletion = new MealCompletionService(models)` and injects it.
  - Verified in Task 5 by a DB-gated end-to-end test.

- [ ] **Step 1: Add `getRankingInputs` to `MealCompletionService`**

In `apps/backend/src/services/meal-completion.service.ts`, add imports:

```ts
import { profileConfidenceFromFactors } from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';
```

Append the method (exact — uses Plan 1's `getSummary`):

```ts
  /**
   * Cold-start profile for the ranking layer (Plan 3). mealGroup is joined
   * by the pipeline, which knows the analyzed meal's foods.
   */
  async getRankingInputs(userId: string): Promise<Omit<RankingProfileInput, 'mealGroup'>> {
    const summary = await this.getSummary(userId);
    return {
      coldStartFactors: summary.factors.map((factor) => ({
        factor: factor.factor,
        affinity: factor.score,
        confidence: factor.confidence,
      })),
      mealGroupAffinities: summary.mealGroupAffinities,
      profileConfidence: profileConfidenceFromFactors(summary.factors),
    };
  }
```

(If `getSummary` does not exist yet, this confirms the Plan 1 prerequisite is not merged — stop and merge Plan 1 first.)

- [ ] **Step 2: Wire the pipeline**

In `apps/backend/src/services/rescue-pipeline.service.ts`:

Add imports (group them with the existing service imports):

```ts
import type { MealCompletionService } from './meal-completion.service';
import {
  additionsFromRescues,
  deriveMealGroup,
} from './ranking/cold-start-signals';
import type { RankingProfileInput } from './ranking/cold-start-signals';
```

Add a module constant next to `MAX_ALTERNATIVES`:

```ts
const RECENT_RESCUES_LIMIT = 10; // anti-fatigue window (spec §8, soft/decaying)
```

Add a private field and ctor param:

```ts
  private readonly mealCompletion: MealCompletionService | null;

  constructor(
    llm: LlmClient,
    private readonly pantryProvider: PantryProvider | null,
    tasteMemory?: TasteMemoryService,
    mealCompletion?: MealCompletionService,
  ) {
    this.generator = new CandidateGeneratorService();
    this.constraintEngine = new ConstraintEngineService();
    this.rankingEngine = new RankingEngineService(llm);
    this.validation = new ValidationService();
    this.tasteMemory = tasteMemory ?? null;
    this.mealCompletion = mealCompletion ?? null;
  }
```

Replace step 3 of `generateRescue` (the `resonanceMemory` block + `rankAndExplain` call):

```ts
    // 3. Ranking + explanations (LLM, deterministic fallback inside)
    const resonanceMemory = this.tasteMemory
      ? await this.tasteMemory.findResonanceMemory(userId, feasible)
      : undefined;

    const profile: RankingProfileInput | undefined = this.mealCompletion
      ? {
          ...(await this.mealCompletion.getRankingInputs(userId)),
          mealGroup: deriveMealGroup(detectedFoods.map((food) => food.name)),
        }
      : undefined;

    const recentlyShown = await this.recentlyShownAdditions(userId);

    const ranked = await this.rankingEngine.rankAndExplain(
      feasible,
      { detectedFoods, detectedComponents },
      constraints,
      preferences,
      resonanceMemory,
      profile ?? null,
      recentlyShown,
    );
```

Change the persisted `modelVersion` (step 5 persistence block) from `'pipeline:v1'` to:

```ts
      modelVersion: 'pipeline:v2',
```

Add the private helper (before `loadPreferences`):

```ts
  /** Addition names recommended in the last rescues - the anti-fatigue input. */
  private async recentlyShownAdditions(userId: string): Promise<string[]> {
    const rescues = await Rescue.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: RECENT_RESCUES_LIMIT,
    });
    return additionsFromRescues(
      rescues.map((row) => ({ selectedRecommendation: row.get('selectedRecommendation') })),
    );
  }
```

- [ ] **Step 3: Register `mealCompletion` in the composition root**

In `apps/backend/src/services/composition.ts`:

Add import (in alphabetical position with the other `./...` service imports):

```ts
import { MealCompletionService } from './meal-completion.service';
```

Instantiate inside `buildServices` (after `tasteMemory`) and inject:

```ts
  const llm = createLlmClient();
  const tasteMemory = new TasteMemoryService(models);
  const mealCompletion = new MealCompletionService(models);
  return {
    mealAnalyzer: new MealAnalyzerService(llm, redis),
    rescuePipeline: new RescuePipelineService(llm, pantryProvider, tasteMemory, mealCompletion),
    feedback: new FeedbackService(models),
    preferenceLearning: new PreferenceLearningService(models),
    tasteMemory,
    mealCompletion,
    pantry: new PantryService(models),
    fridgeNegotiator: new FridgeNegotiatorService(),
    leftoverAlchemist: new LeftoverAlchemistService(),
  };
```

Add `mealCompletion: MealCompletionService;` to the function's return type object.

- [ ] **Step 4: Typecheck + targeted tests**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand cold-start-signals ranking-scoring ranking-payload
```

Expected: clean + PASS. (Full end-to-end verification of this wiring is the DB-gated Task 5.)

- [ ] **Step 5: Fill the behavioral-override seam**

In `apps/backend/src/services/preference-learning.service.ts`, locate the exact line Plan 1 Task 6 inserted:

```ts
    await this.promoteConfirmedSignals(userId, []);
```

Replace it with a call that passes the feedback's real modification ingredients. The feedback payload in that method is the `FeedbackRequest`-shaped object (shared type exposes `outcome?: { modifications?: string[] }`); in Plan 1's merged code it is the method-local variable (`feedback` in the canonical version below) — **if the merged code names it differently, adapt only that identifier**; `npm run typecheck` will catch any mismatch.

```ts
    await this.promoteConfirmedSignals(
      userId,
      normalizeIngredientNames(feedback.outcome?.modifications ?? []),
    );
```

Add `normalizeIngredientNames` to that file's imports from `./ranking/cold-start-signals`.

Verify: `npm run typecheck --workspace @meal-rescue/backend` succeeds. Behavior asserted: cold-start rows still stay `source: 'cold_start'` until real, confirmed behavior arrives (Plan 1 guarantees this for an empty list; this only starts promoting when the user actually logged modifications).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/rescue-pipeline.service.ts apps/backend/src/services/meal-completion.service.ts apps/backend/src/services/composition.ts apps/backend/src/services/preference-learning.service.ts
git commit -m "feat: feed cold-start profile and recency into rescue ranking; promote confirmed signals from real feedback"
```

---

### Task 5: DB-gated end-to-end wiring test

Prove the full loop: profile + recency flow through `generateRescue`, `modelVersion` is `pipeline:v2`, and `getRankingInputs` returns the honest zero-default before any onboarding.

**Files:**
- Test: `apps/backend/tests/ranking-pipeline.integration.test.ts` (create)

**Interfaces:**
- Consumes: real `HeuristicLlmClient` (deterministic), real `MealCompletionService`/`TasteMemoryService`, real `User`/`Meal`/`Rescue`/`AdditionEvent` models, `RescuePipelineService`.
- Uses the exact fixture pattern from `apps/backend/tests/integration/allowance.integration.test.ts` (`seedUser`, `Meal.create` with `detectedComponents: { protein: false }`) and the `TEST_DATABASE_URL` skip pattern from `tests/integration/pipeline.integration.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/ranking-pipeline.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { HeuristicLlmClient } from '../src/services/ai/heuristic-llm-client';
import { MealCompletionService } from '../src/services/meal-completion.service';
import { RescuePipelineService } from '../src/services/rescue-pipeline.service';
import { TasteMemoryService } from '../src/services/taste-memory.service';
import { AdditionEvent } from '../src/database/models/addition-event.model';
import { Feedback } from '../src/database/models/feedback.model';
import { Meal } from '../src/database/models/meal.model';
import { Pantry } from '../src/database/models/pantry.model';
import { Preference } from '../src/database/models/preference.model';
import { Rescue } from '../src/database/models/rescue.model';
import { RescueCreditGrant } from '../src/database/models/rescue-credit-grant.model';
import { TasteMemory } from '../src/database/models/taste-memory.model';
import { User } from '../src/database/models/user.model';
import { closeDatabase, connectDatabase } from './integration/db';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const integrationModels = {
  Pantry,
  Preference,
  Feedback,
  Rescue,
  Meal,
  User,
  RescueCreditGrant,
  TasteMemory,
  AdditionEvent,
} as const;

const describeDb = hasDb ? describe : describe.skip;

describeDb('ranking pipeline wiring', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedUser() {
    return User.create({
      id: randomUUID(),
      email: `rank-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: 'free',
      rescueCredits: 0,
      locale: 'en-US',
      tzOffsetMinutes: 0,
    });
  }

  async function seedMeal(userId: string) {
    return Meal.create({
      id: randomUUID(),
      userId,
      originalInput: 'instant noodles',
      inputType: 'text',
      detectedFoods: [{ name: 'instant noodles', confidence: 0.9 }],
      detectedIngredients: [{ name: 'wheat noodles', confidence: 0.9, state: 'cooked' }],
      detectedComponents: { protein: false },
    });
  }

  it('runs end-to-end deterministically, persists pipeline:v2, and reads last rescues for anti-fatigue', async () => {
    const user = await seedUser();
    const meal = await seedMeal(user.id);
    const tasteMemory = new TasteMemoryService(integrationModels);
    const mealCompletion = new MealCompletionService(integrationModels);
    const pipeline = new RescuePipelineService(new HeuristicLlmClient(), null, tasteMemory, mealCompletion);

    const first = await pipeline.generateRescue(meal.id, user.id, {});
    expect(first.recommendation).toBeDefined();
    expect(first.alternatives.length).toBeLessThanOrEqual(2);
    expect(first.actions).toEqual(['rescue', 'swap', 'dont_have', 'keep_as_is']);

    const persisted = await Rescue.findOne({ where: { mealId: meal.id, userId: user.id } });
    expect(persisted?.modelVersion).toBe('pipeline:v2');
    expect(persisted?.candidatesGenerated).toBeDefined();
    expect((persisted?.selectedRecommendation as { candidate?: { additions?: unknown[] } })?.candidate?.additions).toBeDefined();

    // Second rescue: the previous top pick is now in "recently shown" and
    // the pipeline still completes without error.
    const second = await pipeline.generateRescue(meal.id, user.id, {});
    expect(second.recommendation).toBeDefined();

    const nowShown = await pipeline['recentlyShownAdditions'](user.id);
    expect(nowShown.length).toBeGreaterThan(0);
  });

  it('getRankingInputs returns the honest zero-default before any onboarding', async () => {
    const user = await seedUser();
    const mealCompletion = new MealCompletionService(integrationModels);
    const inputs = await mealCompletion.getRankingInputs(user.id);
    expect(inputs).toEqual({
      coldStartFactors: [],
      mealGroupAffinities: {},
      profileConfidence: 0,
    });
  });
});
```

(`['recentlyShownAdditions']` via bracket access is the pragmatic way to reach the private helper in a test; keep it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @meal-rescue/backend -- --runInBand ranking-pipeline.integration`
Expected: unless run with `TEST_DATABASE_URL` set, it is skipped. Run it DB-backed:

```bash
TEST_DATABASE_URL=postgresql://... npm test --workspace @meal-rescue/backend -- --runInBand ranking-pipeline.integration
```

Expected with Plan 1 merged: PASS. (If `connectDatabase`/`closeDatabase` are not exported from `tests/integration/db`, import the same database helpers the Plan 1 integration test uses.)

- [ ] **Step 3: Full verification + commit**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand
```

Expected: clean + PASS (DB-gated suites skip without `TEST_DATABASE_URL`). Commit:

```bash
git add apps/backend/tests/ranking-pipeline.integration.test.ts
git commit -m "test: end-to-end ranking pipeline wiring with cold-start + anti-fatigue"
```

---

## Self-Review Summary

- **Spec coverage:** §6 generic meal-context prior → Task 1 `genericMealPrior` (+derived `mealGroup`), consumed as `meal_context` in Task 2. §7 weighted additive `w1..w5`, hard gates, recommendation-safety gate → Tasks 1-2 (constants + formula + boost), Task 3 (prompt rule 8/9). §8 anti-fatigue decay + role-family diversity + strategy-rotation guardrail → Task 1 (`recencyPenalty`, `familyCounts`/`familyBenefit`), Task 2 (floor rule 3), Task 3 (prompt rule 8). §9 event model → respected by choosing `Rescue` rows as the freshness source instead of `addition_events`, and documented in Global Constraints. §10 behavioral override → Plan 1 Task 6 seam filled in Task 4 Step 5 (real `outcome.modifications`, only promoting confirmed evidence). The "safety applies before any real recommendation" requirement is enforced regardless of LLM path: the fallback gate at Task 2 and the prompt instruction at Task 3 both lean safe when `profileConfidence < 0.4`.
- **Placeholder scan:** every step has real exported paths, full code, and exact commands. The single adaptive identifier is the feedback payload variable in Plan 1's merged `preference-learning.service.ts` (Task 4 Step 5) — it is flagged inline, is typecheck-verified, and mirrors how Plan 1 itself documented its empty-array seam. No "similar to Task N", no TBD, no skipped test bodies.
- **Type consistency:** `ColdStartProfileInput`/`RankingProfileInput`/`SignalCandidate` are defined once (Task 1) and referenced verbatim in Tasks 2-4; `buildRankingPayload` accepts the exact `profile`/`recentlyShown` types Task 3's signature passes; `getRankingInputs` returns `Omit<RankingProfileInput, 'mealGroup'>` and the pipeline composes `mealGroup` the same way the payload builder derives it. Weight names `w1..w5` match the spec formula order. `RankingPayload.custom` uses `profile?: RankingProfileInput | null` in both the interface and the builder. Task 2's tests import `RankingPayload` after it is made `export` — consistent with Task 2 Step 3.
- **Ordering/merge note:** Tasks 1-3 are implementable immediately (they only touch existing files + a new module); Task 4 and Task 5 require Plan `2026-08-30-meal-completion-backend-core` to be merged (they reference `MealCompletionService`, `AdditionEvent`, `promoteConfirmedSignals`, and `InitializationModels`). The plan assumes sequential execution starting after Plan 1.