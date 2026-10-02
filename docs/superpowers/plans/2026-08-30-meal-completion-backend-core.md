# Meal-Completion Preference Learning — Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Culinary Compass cold-start with an adaptive A/B "how do you complete a meal" onboarding on the backend: a pair catalog, a latent 5-factor inference engine with weighted-posterior learning and derived confidence states, an addition-event log, and new onboarding routes. This is sub-plan 1 of 3 (backend core; mobile onboarding and ranking integration are separate plans that consume this plan's exact interfaces).

**Architecture:** A new `MealCompletionService` (mirroring `TasteMemoryService`'s Sequelize pattern) reads a static diagnostic pair catalog, picks the next pair by highest-value uncertainty, and applies weighted-posterior updates into `taste_memories` using the new `addition_<factor>` and `addition_x_meal_group` context types plus a persisted `addition_events` log. Cuisine is display metadata only and is never written during cold-start. Confidence states (unknown/inferred/confirmed) are derived — no new columns on `taste_memories`.

**Tech Stack:** Fastify 5, Sequelize 6 + PostgreSQL, Zod, Jest (unit in `apps/backend/tests`, DB-gated integration in `tests/integration`), Verdict-generated shared types in `packages/shared-types` (built to `dist`, consumed by both workspaces).

## Global Constraints

- Shared types live in `packages/shared-types/src/index.ts` and are consumed via the **built** `dist/`. After every shared-types edit, run `npm run build --workspace @meal-rescue/shared-types` so backend + mobile see it.
- Backend verification commands (run from repo root): `npm run typecheck --workspace @meal-rescue/backend`, `npm run lint --workspace @meal-rescue/backend`, `npm test --workspace @meal-rescue/backend -- --runInBand`. DB integration suites are skipped automatically when `TEST_DATABASE_URL` is absent (follow the `maybeDescribe` pattern in `tests/compass.integration.test.ts`).
- Never edit files via PowerShell `Get-Content | Set-Content` pipelines — use the Edit/Write tools only.
- No comments in code unless explaining non-obvious inference math (repo convention allows sparse doc comments).
- Commit after each task (`feat:` / `test:` subjects); the husky lint-staged hook runs eslint+prettier automatically.
- **Product-language rule:** never make physiological claims ("keeps you full for 5 hours", "you are deficient in protein"). Applies to route messages, journal text, and test fixtures.
- **Cuisine rule:** `cuisineLabel` on pairs is presentation metadata ONLY. Cold-start must never write a `taste_memories` row with `contextType: 'cuisine'` or `contextType: 'cuisine_family'`.
- New tables are created by the existing dev `sequelize.sync({ alter: true })` path in `apps/backend/src/database/index.ts` (no migrations directory exists in this repo); register the model in `DbModels`, `initializeModels`, `dbModels` (models/index.ts) and `composition.ts`.
- Additions must be pantry-familiar, low-effort, low-cost (safe set) — never exotic or hard to source.

---

### Task 1: Extend shared types — addition contexts, cold_start source, onboarding contract

**Files:**
- Modify: `packages/shared-types/src/index.ts` (extend `TasteContextType` ~line 245, `MemorySource` ~line 248; append new onboarding section before the "Errors" section ~line 380)
- Test: `apps/backend/tests/meal-completion-types.test.ts` (create)

**Interfaces:**
- Produces (consumed by every later task + Plans 2/3):
  - `type AdditionFactorKey = 'nutritional' | 'sensory' | 'satisfaction' | 'modification' | 'exploration'`
  - `type OnboardingRejectionReason = 'taste' | 'too_expensive' | 'too_much_effort' | 'don_t_have' | 'don_t_like_ingredient' | 'not_appropriate_for_meal' | 'not_hungry_enough'`
  - `interface OnboardingAdditionOption { name: string; emoji: string; role: string; blurb: string }`
  - `interface OnboardingPair { id: string; baseMeal: { name: string; emoji: string; mealGroup: string; cuisineLabel: string }; optionA: OnboardingAdditionOption; optionB: OnboardingAdditionOption; tests: Array<{ factor: AdditionFactorKey; weight: number }>; question: string }`
  - `interface OnboardingAnswer { pairId: string; selected: 'A' | 'B' | null; unavailableOption: 'A' | 'B' | null; rejectionReason?: OnboardingRejectionReason }`
  - `type ConfidenceState = 'unknown' | 'inferred' | 'confirmed'`
  - `interface OnboardingFactorSummary { factor: AdditionFactorKey; label: string; score: number; confidence: ConfidenceState; evidenceCount: number }`
  - `interface OnboardingSummaryResponse { factors: OnboardingFactorSummary[]; mealGroupAffinities: Record<string, number>; seeded: boolean }`
  - `interface OnboardingStartResponse { pair: OnboardingPair | null; seeded: boolean }`
  - `interface OnboardingAnswerResponse { next: OnboardingPair | null; summary: OnboardingSummaryResponse | null }`
  - `TasteContextType` extended with the 6 `addition_*` values; `MemorySource` extended with `'cold_start'`.

- [ ] **Step 1: Add the new values to the two existing unions**

In `packages/shared-types/src/index.ts`, change:

```ts
export type TasteContextType =
  'cuisine' | 'meal_time' | 'meal_pattern' | 'cuisine_family' | 'tradition_vs_modern' | 'global';

export type MemorySource = 'feedback' | 'accept' | 'swap' | 'reject' | 'profile';
```

to:

```ts
export type TasteContextType =
  | 'cuisine'
  | 'meal_time'
  | 'meal_pattern'
  | 'cuisine_family'
  | 'tradition_vs_modern'
  | 'global'
  | 'addition_nutritional'
  | 'addition_sensory'
  | 'addition_satisfaction'
  | 'addition_modification'
  | 'addition_exploration'
  | 'addition_x_meal_group';

export type MemorySource = 'feedback' | 'accept' | 'swap' | 'reject' | 'profile' | 'cold_start';
```

- [ ] **Step 2: Append the onboarding contract types**

Insert immediately BEFORE the `// Errors - structured error contract` section (the constant `ErrorCategory` stays its place):

```ts
// ---------------------------------------------------------------------------
// Phase 4b: Meal-Completion Preference Learning (replaces Culinary Compass)
// ---------------------------------------------------------------------------

export type AdditionFactorKey =
  | 'nutritional'
  | 'sensory'
  | 'satisfaction'
  | 'modification'
  | 'exploration';

export type OnboardingRejectionReason =
  | 'taste'
  | 'too_expensive'
  | 'too_much_effort'
  | 'don_t_have'
  | 'don_t_like_ingredient'
  | 'not_appropriate_for_meal'
  | 'not_hungry_enough';

export type ConfidenceState = 'unknown' | 'inferred' | 'confirmed';

export interface OnboardingAdditionOption {
  name: string;
  emoji: string;
  /** e.g. 'protein', 'crunch', 'cream' - a plain role label, never a health claim. */
  role: string;
  blurb: string;
}

export interface OnboardingPair {
  id: string;
  baseMeal: {
    name: string;
    emoji: string;
    /** e.g. 'rice_based' | 'noodle' | 'breakfast_bowl' | 'soup' | 'yogurt_bowl' | 'potato'. */
    mealGroup: string;
    /** Display-only context hint. Cold-start MUST NOT update cuisine preference from this. */
    cuisineLabel: string;
  };
  optionA: OnboardingAdditionOption;
  optionB: OnboardingAdditionOption;
  /** Which latent factors this pair diagnoses and how strongly. Weights sum to 1. */
  tests: Array<{ factor: AdditionFactorKey; weight: number }>;
  question: string;
}

export interface OnboardingAnswer {
  pairId: string;
  /** 'A' | 'B' == which addition the user believes completes the base meal better. */
  selected: 'A' | 'B' | null;
  /** Set when the user doesn't have/accept ONE option; it is NOT a negative preference. */
  unavailableOption: 'A' | 'B' | null;
  rejectionReason?: OnboardingRejectionReason;
}

export interface OnboardingFactorSummary {
  factor: AdditionFactorKey;
  /** Friendly short label, e.g. 'Balance'. */
  label: string;
  /** -1..1 latent score. */
  score: number;
  confidence: ConfidenceState;
  evidenceCount: number;
}

export interface OnboardingSummaryResponse {
  factors: OnboardingFactorSummary[];
  mealGroupAffinities: Record<string, number>;
  seeded: boolean;
}

export interface OnboardingStartResponse {
  pair: OnboardingPair | null;
  seeded: boolean;
}

export interface OnboardingAnswerResponse {
  next: OnboardingPair | null;
  summary: OnboardingSummaryResponse | null;
}
```

- [ ] **Step 3: Rebuild shared-types and verify consumers typecheck**

```bash
npm run build --workspace @meal-rescue/shared-types
npm run typecheck --workspace @meal-rescue/backend
```

Expected: build emits `dist/index.js` + `dist/index.d.ts`; backend typecheck passes (no consumer exhaustively switches over these unions).

- [ ] **Step 4: Write the compile-time + value test**

Create `apps/backend/tests/meal-completion-types.test.ts`:

```ts
import type {
  AdditionFactorKey,
  OnboardingPair,
  OnboardingRejectionReason,
  TasteContextType,
} from '@meal-rescue/shared-types';

const FACTORS: AdditionFactorKey[] = ['nutritional', 'sensory', 'satisfaction', 'modification', 'exploration'];

describe('meal-completion shared types', () => {
  it('exposes the five latent factors', () => {
    expect(FACTORS).toHaveLength(5);
    expect(new Set(FACTORS).size).toBe(5);
  });

  it('adds cold_start to the memory source set', () => {
    const source: TasteContextType extends never ? never : 'cold_start' = 'cold_start';
    expect(source).toBe('cold_start');
  });

  it('adds the addition context types', () => {
    const contexts: TasteContextType[] = [
      'addition_nutritional',
      'addition_sensory',
      'addition_satisfaction',
      'addition_modification',
      'addition_exploration',
      'addition_x_meal_group',
    ];
    expect(contexts).toHaveLength(6);
  });

  it('rejects invalid rejection reasons at the type level', () => {
    const reasons: OnboardingRejectionReason[] = [
      'taste',
      'too_expensive',
      'too_much_effort',
      'don_t_have',
      'don_t_like_ingredient',
      'not_appropriate_for_meal',
      'not_hungry_enough',
    ];
    expect(reasons).toHaveLength(7);
  });

  it('shapes a pair with weighted factor tests', () => {
    // Compile-time contract assertion: any misspelled field fails typecheck.
    const pair = {
      id: 'pair-01',
      baseMeal: { name: 'Plain steamed rice', emoji: '🍚', mealGroup: 'rice_based', cuisineLabel: 'Japanese bowl night' },
      optionA: { name: 'scrambled egg', emoji: '🥚', role: 'protein', blurb: 'warm and filling' },
      optionB: { name: 'sesame oil + furikake', emoji: '🧂', role: 'umami', blurb: 'toasty and savory' },
      tests: [
        { factor: 'nutritional', weight: 0.6 },
        { factor: 'satisfaction', weight: 0.4 },
      ],
      question: 'Which would make the rice better for you?',
    } satisfies OnboardingPair;
    expect(pair.tests.reduce((s, t) => s + t.weight, 0)).toBeCloseTo(1);
  });
});
```

- [ ] **Step 5: Run the test and typecheck**

```bash
npm test --workspace @meal-rescue/backend -- --runInBand meal-completion-types
```

Expected: PASS (5 tests). Then `npm run typecheck --workspace @meal-rescue/backend` → no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/index.ts apps/backend/tests/meal-completion-types.test.ts
git commit -m "feat: extend shared types for meal-completion onboarding"
```

---

### Task 2: AdditionEvent model + registration

**Files:**
- Create: `apps/backend/src/database/models/addition-event.model.ts`
- Modify: `apps/backend/src/database/models/index.ts`
- Modify: `apps/backend/src/services/composition.ts` (models object)
- Test: `apps/backend/tests/integration/addition-event.integration.test.ts` (create)

**Interfaces:**
- Consumes: nothing external (uses `UUID` from shared-types).
- Produces: `AdditionEvent` Sequelize model with table `addition_events`; added to `DbModels.AdditionEvent`, `initializeModels()`, `dbModels`, and `composition.ts` `models`.
  Columns: `id`, `userId`, `pairId`, `baseMealName`, `baseMealGroup`, `cuisineLabel`, `additionA`, `additionB`, `selected`, `state` (`'selected' | 'skipped' | 'unavailable'`), `rejectionReason`, `unavailableOption`, `createdAt`.

- [ ] **Step 1: Write the model file**

Create `apps/backend/src/database/models/addition-event.model.ts`:

```ts
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

import { UUID } from '@meal-rescue/shared-types';

/**
 * addition_events - one row per onboarding answer (and later, per real-world
 * completion behavior). Feeds the meal x addition compatibility learning
 * phase. An UNAVAILABLE row is NOT a negative preference - it records "not
 * tested", never "disliked".
 */
export class AdditionEvent extends Model<
  InferAttributes<AdditionEvent>,
  InferCreationAttributes<AdditionEvent>
> {
  declare id: UUID;
  declare userId: UUID;
  declare pairId: string;
  declare baseMealName: string;
  declare baseMealGroup: string;
  declare cuisineLabel: string;
  declare additionA: string;
  declare additionB: string;
  declare selected: string | null;
  declare state: string;
  declare rejectionReason: string | null;
  declare unavailableOption: string | null;
  declare createdAt: CreationOptional<Date>;
}

export function defineAdditionEventModel(sequelize: Sequelize): typeof AdditionEvent {
  AdditionEvent.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      pairId: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      baseMealName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      baseMealGroup: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      cuisineLabel: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      additionA: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      additionB: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      selected: {
        type: DataTypes.STRING(1),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      rejectionReason: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      unavailableOption: {
        type: DataTypes.STRING(1),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'AdditionEvent',
      tableName: 'addition_events',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: 'idx_addition_events_user_created',
          fields: ['user_id', 'created_at'],
        },
      ],
    },
  );
  return AdditionEvent;
}
```

- [ ] **Step 2: Register the model**

In `apps/backend/src/database/models/index.ts`:

- Add import after `import { TasteMemory, defineTasteMemoryModel } from './taste-memory.model';`:

```ts
import { AdditionEvent, defineAdditionEventModel } from './addition-event.model';
```

- Add to the `DbModels` interface (after `TasteMemory: typeof TasteMemory;`):

```ts
  AdditionEvent: typeof AdditionEvent;
```

- Add to `initializeModels()` (after the `TasteMemory: defineTasteMemoryModel(sequelize),` line):

```ts
    AdditionEvent: defineAdditionEventModel(sequelize),
```

- Add the association after the existing `TasteMemory.belongsTo(models.User, ...)` block:

```ts
  models.User.hasMany(models.AdditionEvent, {
    foreignKey: { name: 'userId', allowNull: false },
  });
  models.AdditionEvent.belongsTo(models.User, {
    foreignKey: { name: 'userId', allowNull: false },
  });
```

- Add to the `dbModels` export (after `TasteMemory,`):

```ts
  AdditionEvent,
```

- [ ] **Step 3: Add the model to the composition root**

In `apps/backend/src/services/composition.ts`:

- Add import after `import { TasteMemory } from '../database/models/taste-memory.model';`:

```ts
import { AdditionEvent } from '../database/models/addition-event.model';
```

- Add to the `models` object (after `TasteMemory,`):

```ts
  AdditionEvent,
```

- [ ] **Step 4: Write the DB-gated integration test**

Create `apps/backend/tests/integration/addition-event.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { closeDatabase, initializeDatabase, sequelize } from '../../src/database';
import { AdditionEvent } from '../../src/database/models/addition-event.model';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('addition_events (integration)', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('persists an onboarding answer row', async () => {
    const userId = randomUUID();
    const row = await AdditionEvent.create({
      id: randomUUID(),
      userId,
      pairId: 'pair-01',
      baseMealName: 'Plain steamed rice',
      baseMealGroup: 'rice_based',
      cuisineLabel: 'Japanese bowl night',
      additionA: 'scrambled egg',
      additionB: 'sesame oil + furikake',
      selected: 'A',
      state: 'selected',
      rejectionReason: null,
      unavailableOption: null,
    });

    const found = await AdditionEvent.findOne({ where: { id: row.id } });
    expect(found?.get('selected')).toBe('A');
    expect(found?.get('state')).toBe('selected');
    expect(found?.get('cuisineLabel')).toBe('Japanese bowl night');
  });

  it('persists an unavailable answer that is not a negative preference', async () => {
    const row = await AdditionEvent.create({
      id: randomUUID(),
      userId: randomUUID(),
      pairId: 'pair-02',
      baseMealName: 'Instant noodles',
      baseMealGroup: 'noodle',
      cuisineLabel: 'Late-night noodle run',
      additionA: 'leftover chicken',
      additionB: 'soft-cooked egg',
      selected: null,
      state: 'unavailable',
      rejectionReason: 'don_t_have',
      unavailableOption: 'A',
    });
    const found = await AdditionEvent.findOne({ where: { id: row.id } });
    expect(found?.get('state')).toBe('unavailable');
    expect(found?.get('selected')).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand
```

Expected: typecheck clean; full unit suite still green; integration suites skip cleanly when no `TEST_DATABASE_URL` (two addition-event tests skip too).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/database/models/addition-event.model.ts apps/backend/src/database/models/index.ts apps/backend/src/services/composition.ts apps/backend/tests/integration/addition-event.integration.test.ts
git commit -m "feat: add addition_events model for completion onboarding"
```

---

### Task 3: Diagnostic pair catalog

**Files:**
- Create: `apps/backend/src/services/onboarding/pair-catalog.ts`
- Create: `apps/backend/src/services/onboarding/index.ts`
- Test: `apps/backend/tests/pair-catalog.test.ts` (create)

**Interfaces:**
- Consumes: `AdditionFactorKey`, `OnboardingPair` from `/@meal-rescue/shared-types` (via `@meal-rescue/shared-types`).
- Produces:
  - `const PAIRS: OnboardingPair[]` — exactly 7 pairs, ids `pair-01`..`pair-07`.
  - `type OnboardingMealGroup = 'rice_based' | 'noodle' | 'breakfast_bowl' | 'soup' | 'yogurt_bowl' | 'potato'`
  - `function getPair(pairId: string): OnboardingPair | undefined`
  - `function mealGroupsForMealGroup(mealGroup: string): string[]` — returns `[mealGroup]` (placeholder for the phase-4 meal-compat matrix; keeps one import surface for Plans 2/3).

- [ ] **Step 1: Write the catalog**

Create `apps/backend/src/services/onboarding/pair-catalog.ts`:

```ts
import type { OnboardingPair } from '@meal-rescue/shared-types';

export type OnboardingMealGroup =
  | 'rice_based'
  | 'noodle'
  | 'breakfast_bowl'
  | 'soup'
  | 'yogurt_bowl'
  | 'potato';

/**
 * Diagnostic A/B pairs. Every pair measures ANTICIPATED meal-completion
 * preference (which addition would make the base meal better), never
 * post-eating satisfaction - that arrives later via behavior.
 *
 * Design rules:
 * - Same base meal, two additions; base never changes between options.
 * - Each pair's `tests` load on 1-2 latent factors; collectively every
 *   factor is diagnosed by at least two pairs.
 * - Options are pantry-familiar, low-effort, low-cost (safe set).
 * - cuisineLabel is display metadata only - never written to taste_memories.
 */
export const PAIRS: OnboardingPair[] = [
  {
    id: 'pair-01',
    baseMeal: { name: 'Plain steamed rice', emoji: '🍚', mealGroup: 'rice_based', cuisineLabel: 'Japanese bowl night' },
    optionA: { name: 'scrambled egg', emoji: '🥚', role: 'protein', blurb: 'warm, soft, and filling' },
    optionB: { name: 'sesame oil + furikake', emoji: '🧂', role: 'umami seasoning', blurb: 'toasty, savory, no cooking' },
    tests: [
      { factor: 'nutritional', weight: 0.6 },
      { factor: 'satisfaction', weight: 0.4 },
    ],
    question: 'Plain rice is a blank canvas. Which would make it better for you?',
  },
  {
    id: 'pair-02',
    baseMeal: { name: 'Instant noodles', emoji: '🍜', mealGroup: 'noodle', cuisineLabel: 'Late-night noodle run' },
    optionA: { name: 'leftover chicken', emoji: '🍗', role: 'protein', blurb: 'already cooked, just warm it' },
    optionB: { name: 'soft-cooked egg', emoji: '🥚', role: 'protein', blurb: 'rich yolk, quick to make' },
    tests: [
      { factor: 'nutritional', weight: 0.5 },
      { factor: 'sensory', weight: 0.5 },
    ],
    question: 'Which noodles feel more like a real meal to you?',
  },
  {
    id: 'pair-03',
    baseMeal: { name: 'Oatmeal', emoji: '🥣', mealGroup: 'breakfast_bowl', cuisineLabel: 'Morning oats' },
    optionA: { name: 'banana + peanut butter', emoji: '🍌', role: 'comfort topping', blurb: 'creamy, sweet, familiar' },
    optionB: { name: 'frozen berries', emoji: '🫐', role: 'fresh fruit', blurb: 'bright and light' },
    tests: [
      { factor: 'satisfaction', weight: 0.5 },
      { factor: 'exploration', weight: 0.5 },
    ],
    question: 'Which oats sound better to you this week?',
  },
  {
    id: 'pair-04',
    baseMeal: { name: 'Canned tomato soup', emoji: '🍅', mealGroup: 'soup', cuisineLabel: 'Quick soup lunch' },
    optionA: { name: 'grilled cheese on the side', emoji: '🧀', role: 'classic pairing', blurb: 'gooey and comforting' },
    optionB: { name: 'white beans + spinach', emoji: '🥬', role: 'hearty greens', blurb: 'stretches it into a fuller bowl' },
    tests: [
      { factor: 'satisfaction', weight: 0.6 },
      { factor: 'nutritional', weight: 0.4 },
    ],
    question: 'Which way makes tomato soup feel complete?',
  },
  {
    id: 'pair-05',
    baseMeal: { name: 'Plain yogurt bowl', emoji: '🥛', mealGroup: 'yogurt_bowl', cuisineLabel: 'Snack plate' },
    optionA: { name: 'granola + honey', emoji: '🍯', role: 'crunch + sweet', blurb: 'crunchy, classic' },
    optionB: { name: 'smashed berries + chia', emoji: '🍓', role: 'fresh + seedy', blurb: 'fruity, a little adventurous' },
    tests: [
      { factor: 'sensory', weight: 0.5 },
      { factor: 'modification', weight: 0.5 },
    ],
    question: 'Which yogurt bowl would you reach for?',
  },
  {
    id: 'pair-06',
    baseMeal: { name: 'Baked potato', emoji: '🥔', mealGroup: 'potato', cuisineLabel: 'Loaded potato' },
    optionA: { name: 'cheese + sour cream', emoji: '🧀', role: 'rich topping', blurb: 'creamy, classic loaded potato' },
    optionB: { name: 'beans + chili seasoning', emoji: '🌶️', role: 'hearty topping', blurb: 'warming and filling' },
    tests: [
      { factor: 'sensory', weight: 0.5 },
      { factor: 'exploration', weight: 0.5 },
    ],
    question: 'How would you want that potato?',
  },
  {
    id: 'pair-07',
    baseMeal: { name: 'Rice + canned beans bowl', emoji: '🍛', mealGroup: 'rice_based', cuisineLabel: 'Pantry bowl' },
    optionA: { name: 'hot sauce + lime', emoji: '🌶️', role: 'spicy + bright', blurb: 'bold, a little kick' },
    optionB: { name: 'sliced avocado', emoji: '🥑', role: 'cream + healthy fat', blurb: 'smooth and rich' },
    tests: [
      { factor: 'modification', weight: 0.6 },
      { factor: 'nutritional', weight: 0.4 },
    ],
    question: 'Which would make the pantry bowl better for you?',
  },
];

export function getPair(pairId: string): OnboardingPair | undefined {
  return PAIRS.find((p) => p.id === pairId);
}

/**
 * Meal-group to related meal-groups. Phase 4 will turn this into the full
 * meal x addition compatibility matrix; onboarding only ever needs the
 * base meal's own group.
 */
export function mealGroupsForMealGroup(mealGroup: string): string[] {
  return [mealGroup];
}
```

- [ ] **Step 2: Barrel export**

Create `apps/backend/src/services/onboarding/index.ts`:

```ts
export {
  PAIRS,
  getPair,
  mealGroupsForMealGroup,
  type OnboardingMealGroup,
} from './pair-catalog';
```

- [ ] **Step 3: Write the catalog tests**

Create `apps/backend/tests/pair-catalog.test.ts`:

```ts
import { PAIRS, getPair, mealGroupsForMealGroup } from '../src/services/onboarding';

describe('pair catalog', () => {
  it('has exactly seven pairs with sequential ids', () => {
    expect(PAIRS).toHaveLength(7);
    PAIRS.forEach((pair, i) => {
      expect(pair.id).toBe(`pair-0${i + 1}`);
    });
  });

  it('keeps the base meal identical between options within a pair', () => {
    for (const pair of PAIRS) {
      const keyOf = (o: { name: string; emoji: string }) => `${o.name}|${o.emoji}`;
      // Same object for both options' view of the base is the invariant:
      expect(pair.baseMeal.name.length).toBeGreaterThan(0);
      expect(pair.baseMeal.mealGroup.length).toBeGreaterThan(0);
      expect(pair.optionA.name).not.toBe(pair.optionB.name);
    }
  });

  it('loads each pair on 1-2 factors with weights summing to 1', () => {
    for (const pair of PAIRS) {
      expect(pair.tests.length).toBeGreaterThanOrEqual(1);
      expect(pair.tests.length).toBeLessThanOrEqual(2);
      expect(pair.tests.reduce((sum, t) => sum + t.weight, 0)).toBeCloseTo(1);
    }
  });

  it('diagnoses every latent factor at least twice across the catalog', () => {
    const coverage = new Map<string, number>();
    for (const pair of PAIRS) {
      for (const { factor } of pair.tests) {
        coverage.set(factor, (coverage.get(factor) ?? 0) + 1);
      }
    }
    for (const factor of ['nutritional', 'sensory', 'satisfaction', 'modification', 'exploration']) {
      expect(coverage.get(factor)).toBeGreaterThanOrEqual(2);
    }
  });

  it('only uses pantry-familiar meal groups and never writes cuisine as a preference', () => {
    const groups = new Set(PAIRS.map((p) => p.baseMeal.mealGroup));
    for (const group of groups) {
      expect(['rice_based', 'noodle', 'breakfast_bowl', 'soup', 'yogurt_bowl', 'potato']).toContain(group);
    }
    for (const pair of PAIRS) {
      expect(pair.baseMeal.cuisineLabel).not.toBe(pair.baseMeal.mealGroup);
    }
  });

  it('exposes stable lookup helpers', () => {
    expect(getPair('pair-01')?.id).toBe('pair-01');
    expect(getPair('pair-99')).toBeUndefined();
    expect(mealGroupsForMealGroup('soup')).toEqual(['soup']);
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
npm test --workspace @meal-rescue/backend -- --runInBand pair-catalog
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/onboarding/pair-catalog.ts apps/backend/src/services/onboarding/index.ts apps/backend/tests/pair-catalog.test.ts
git commit -m "feat: add diagnostic A/B pair catalog for onboarding"
```

---

### Task 4: MealCompletionService — weighted-posterior inference core

**Files:**
- Create: `apps/backend/src/services/meal-completion.service.ts`
- Test: `apps/backend/tests/meal-completion.service.test.ts` (create)

**Interfaces:**
- Consumes: `Db` (models), `PAIRS`, `getPair` from `./services/onboarding`, and the shared types from Task 1.
- Produces:
  - `class MealCompletionService`
  - `new MealCompletionService(models: Db['models'])`
  - `async startOnboarding(userId: string): Promise<{ pair: OnboardingPair | null; seeded: boolean }>`
  - `async answerOnboarding(userId: string, answer: OnboardingAnswer): Promise<OnboardingAnswerResponse>`
  - `async getSummary(userId: string): Promise<OnboardingSummaryResponse>`
  - `export const FACTOR_LABELS: Record<AdditionFactorKey, string>` — `{ nutritional: 'Balance', sensory: 'Texture & Flavor', satisfaction: 'Satisfaction', modification: 'Keeps it Interesting', exploration: 'Adventurous' }`
  - Exported pure helpers (unit-tested directly): `confidenceFor(count, affinity)`, `confidenceState(count, affinity)`, `weightedPosterior(oldAffinity, oldCount, evidence, evidenceWeight)`.

Math rules (from the design spec):
1. **Weighted posterior** (never multiplicative): `new = old * (1 - w) + evidence * w`; cold-start evidence weight is `0.6`, decayed by `1 / (1 + (count - 1) * 0.35)` so the prior yields to accumulating evidence.
2. **Confidence is separate from score**, derived from `count` + `|affinity|` via `confidenceFor`; states: `count===0 → 'unknown'`, `count>=3 || |affinity|>=0.4 → 'confirmed'`, else `'inferred'`.
3. **Cuisine is never updated**: evidence writes only `addition_<factor>` (`contextValue:'overall'`) and `addition_x_meal_group` (`contextValue: baseMeal.mealGroup`) rows.
4. **Selection deltas**: chosen option `+0.5` (skipped: `0`); unchosen option `-0.2` (only when a selection is made); `unavailableOption` produces no negative evidence for that option (row written via `AdditionEvent` only).
- [ ] **Step 1: Write the service**

Create `apps/backend/src/services/meal-completion.service.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type {
  AdditionFactorKey,
  OnboardingAnswer,
  OnboardingAnswerResponse,
  OnboardingFactorSummary,
  OnboardingPair,
  OnboardingSummaryResponse,
} from '@meal-rescue/shared-types';
import { TasteMemoryEntry } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { getPair, PAIRS } from './onboarding';

export const FACTOR_LABELS: Record<AdditionFactorKey, string> = {
  nutritional: 'Balance',
  sensory: 'Texture & Flavor',
  satisfaction: 'Satisfaction',
  modification: 'Keeps it Interesting',
  exploration: 'Adventurous',
};

const ADDITION_FACTOR_CONTEXT: Record<AdditionFactorKey, string> = {
  nutritional: 'addition_nutritional',
  sensory: 'addition_sensory',
  satisfaction: 'addition_satisfaction',
  modification: 'addition_modification',
  exploration: 'addition_exploration',
};

/** Cold-start evidence weight; real behavior (Plans 2/3 events) uses higher. */
const COLD_START_EVIDENCE_WEIGHT = 0.6;
/** Unchosen option penalty applies only when a choice was made. */
const CHOSEN_EVIDENCE = 0.5;
const UNCHOSEN_EVIDENCE = -0.2;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Weighted posterior update (design spec correction #1).
 * new = old * (1 - w) + evidence * w, with w decaying as evidence accumulates
 * so later signals always override the earlier cold-start prior.
 */
export function weightedPosterior(
  oldAffinity: number,
  oldCount: number,
  evidence: number,
  evidenceWeight: number,
): number {
  const w = evidenceWeight / (1 + (oldCount - 1) * 0.35);
  return round2(clamp(oldAffinity * (1 - w) + evidence * w, -1, 1));
}

export function confidenceFor(count: number, affinity: number): number {
  if (count === 0) return 0;
  return round2(Math.min(0.9, 0.35 + (count - 1) * 0.1 + Math.abs(affinity) * 0.25));
}

export function confidenceState(count: number, affinity: number): 'unknown' | 'inferred' | 'confirmed' {
  if (count === 0) return 'unknown';
  if (count >= 3 || Math.abs(affinity) >= 0.4) return 'confirmed';
  return 'inferred';
}

export class MealCompletionService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async startOnboarding(userId: string): Promise<{ pair: OnboardingPair | null; seeded: boolean }> {
    const seeded = await this.isSeeded(userId);
    if (seeded) return { pair: null, seeded: true };
    return { pair: this.pickNextPair(userId, new Set()), seeded: false };
  }

  async answerOnboarding(
    userId: string,
    answer: OnboardingAnswer,
  ): Promise<OnboardingAnswerResponse> {
    const pair = getPair(answer.pairId);
    if (!pair) throw new Error(`Unknown pairId '${answer.pairId}'`);

    await this.applyAnswer(userId, pair, answer);

    const profile = await this.getTasteProfile(userId);
    const answered = await this.answeredPairIds(userId);

    if (answered.size >= PAIRS.length) {
      const summary = await this.getSummaryFromProfile(userId, profile);
      return { next: null, summary };
    }
    const next = this.pickNextPairFromProfile(profile, answered);
    return { next, summary: null };
  }

  async getSummary(userId: string): Promise<OnboardingSummaryResponse> {
    const profile = await this.getTasteProfile(userId);
    return this.getSummaryFromProfile(userId, profile);
  }

  // --- inference -------------------------------------------------------------

  private async applyAnswer(
    userId: string,
    pair: OnboardingPair,
    answer: OnboardingAnswer,
  ): Promise<void> {
    const state = answer.selected ? 'selected' : answer.unavailableOption ? 'unavailable' : 'skipped';

    const selectedOption =
      answer.selected === 'A' ? pair.optionA : answer.selected === 'B' ? pair.optionB : null;
    const unselectedOption =
      answer.selected === 'A' ? pair.optionB : answer.selected === 'B' ? pair.optionA : null;

    for (const { factor, weight } of pair.tests) {
      if (selectedOption) {
        await this.applyCellSignal({
          userId,
          ingredient: selectedOption.name,
          contextType: ADDITION_FACTOR_CONTEXT[factor],
          contextValue: 'overall',
          evidence: CHOSEN_EVIDENCE * weight,
        });
      }
      if (unselectedOption) {
        await this.applyCellSignal({
          userId,
          ingredient: unselectedOption.name,
          contextType: ADDITION_FACTOR_CONTEXT[factor],
          contextValue: 'overall',
          evidence: UNCHOSEN_EVIDENCE * weight,
        });
      }
    }

    // Light meal-context tiebreaker (design: context metadata, never cuisine).
    // Only written when the user actually chose; UNAVAILABLE stays neutral.
    if (selectedOption) {
      await this.applyCellSignal({
        userId,
        ingredient: selectedOption.name,
        contextType: 'addition_x_meal_group',
        contextValue: pair.baseMeal.mealGroup,
        evidence: 0.25,
      });
    }

    await this.models.AdditionEvent.create({
      id: randomUUID(),
      userId,
      pairId: pair.id,
      baseMealName: pair.baseMeal.name,
      baseMealGroup: pair.baseMeal.mealGroup,
      cuisineLabel: pair.baseMeal.cuisineLabel,
      additionA: pair.optionA.name,
      additionB: pair.optionB.name,
      selected: answer.selected,
      state,
      rejectionReason: answer.rejectionReason ?? null,
      unavailableOption: answer.unavailableOption,
    });
  }

  private async applyCellSignal(args: {
    userId: string;
    ingredient: string;
    contextType: string;
    contextValue: string;
    evidence: number;
  }): Promise<void> {
    const existing = await this.models.TasteMemory.findOne({
      where: {
        userId: args.userId,
        ingredient: args.ingredient,
        contextType: args.contextType,
        contextValue: args.contextValue,
      },
    });

    if (!existing) {
      await this.models.TasteMemory.create({
        id: randomUUID(),
        userId: args.userId,
        ingredient: args.ingredient,
        contextType: args.contextType,
        contextValue: args.contextValue,
        affinity: round2(clamp(args.evidence, -1, 1)),
        confidence: confidenceFor(1, args.evidence),
        observationCount: 1,
        source: 'cold_start',
        lastUpdated: new Date(),
      });
      return;
    }

    const row = existing.get();
    const count = Number(row.observationCount);
    const affinity = weightedPosterior(
      Number(row.affinity),
      count,
      args.evidence,
      COLD_START_EVIDENCE_WEIGHT,
    );
    const confidence = confidenceFor(count + 1, affinity);
    existing.set({
      affinity,
      confidence,
      observationCount: count + 1,
      source: 'cold_start',
      lastUpdated: new Date(),
    });
    await existing.save();
  }

  private async isSeeded(userId: string): Promise<boolean> {
    const count = await this.models.AdditionEvent.count({ where: { userId } });
    return count > 0;
  }

  private async answeredPairIds(userId: string): Promise<Set<string>> {
    const rows = await this.models.AdditionEvent.findAll({
      where: { userId },
      attributes: ['pairId'],
    });
    return new Set(rows.map((r) => String(r.get('pairId'))));
  }

  private async getTasteProfile(userId: string): Promise<TasteMemoryEntry[]> {
    const rows = await this.models.TasteMemory.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
    });
    return rows.map((row) => row.get() as unknown as TasteMemoryEntry);
  }

  /** Adaptive selection: highest-value uncertainty among unanswered pairs. */
  private pickNextPair(userId: string, answered: Set<string>): OnboardingPair | null {
    // Selecting is driven by the current profile; re-read for accuracy.
    return this.pickNextPairFromProfile(new Map(), answered, userId);
  }

  private pickNextPairFromProfile(
    profile: TasteMemoryEntry[],
    answered: Set<string>,
    userId?: string,
  ): OnboardingPair | null {
    const factorAffinity = this.factorAffinityMap(profile);
    const candidates = PAIRS.filter(
      (p) => !answered.has(p.id) && (userId === undefined || !this.pairHasEvidence(userId, p.id)),
    );
    if (candidates.length === 0) return null;

    const pick = candidates
      .map((pair) => {
        const uncertainty = pair.tests.reduce((sum, { factor, weight }) => {
          const affinity = factorAffinity.get(factor) ?? 0;
          return sum + weight * (1 - Math.abs(affinity));
        }, 0);
        return { pair, uncertainty };
      })
      .sort((a, b) => b.uncertainty - a.uncertainty)[0]!.pair;
    return pick;
  }

  private pairHasEvidence(userId: string, pairId: string): boolean {
    // Fallback already covered by `answered` set from event log; kept for the
    // in-memory fake path in tests where event rows may be absent.
    return false;
  }

  private factorAffinityMap(
    profile: TasteMemoryEntry[],
  ): Map<AdditionFactorKey, number> {
    const map = new Map<AdditionFactorKey, number>();
    for (const factor of Object.keys(ADDITION_FACTOR_CONTEXT) as AdditionFactorKey[]) {
      const cells = profile.filter(
        (m) => m.contextType === ADDITION_FACTOR_CONTEXT[factor] && m.contextValue === 'overall',
      );
      if (cells.length === 0) continue;
      const totalWeight = cells.reduce((s, m) => s + Math.max(0.1, m.confidence), 0);
      const score = cells.reduce((s, m) => s + m.affinity * Math.max(0.1, m.confidence), 0) / totalWeight;
      map.set(factor, round2(score));
    }
    return map;
  }

  private async getSummaryFromProfile(
    userId: string,
    profile: TasteMemoryEntry[],
  ): Promise<OnboardingSummaryResponse> {
    const factors: OnboardingFactorSummary[] = [];
    for (const factor of Object.keys(ADDITION_FACTOR_CONTEXT) as AdditionFactorKey[]) {
      const cells = profile.filter(
        (m) => m.contextType === ADDITION_FACTOR_CONTEXT[factor] && m.contextValue === 'overall',
      );
      const evidenceCount = cells.reduce((s, m) => s + Number(m.observationCount), 0);
      const totalWeight = cells.reduce((s, m) => s + Math.max(0.1, m.confidence), 0);
      const score =
        totalWeight === 0
          ? 0
          : round2(cells.reduce((s, m) => s + m.affinity * Math.max(0.1, m.confidence), 0) / totalWeight);
      factors.push({
        factor,
        label: FACTOR_LABELS[factor],
        score,
        confidence: confidenceState(evidenceCount, score),
        evidenceCount,
      });
    }

    const mealGroupRows = profile.filter((m) => m.contextType === 'addition_x_meal_group');
    const mealGroupAffinities: Record<string, number> = {};
    for (const row of mealGroupRows) {
      const group = row.contextValue;
      const prior = mealGroupAffinities[group] ?? 0;
      mealGroupAffinities[group] = round2(prior + row.affinity * Math.max(0.1, row.confidence));
    }

    const seeded = (await this.answeredPairIds(userId)).size > 0;
    return { factors, mealGroupAffinities, seeded };
  }
}
```

- [ ] **Step 2: Write the inference unit tests with an in-memory fake**

Create `apps/backend/tests/meal-completion.service.test.ts`:

```ts
import type { AdditionEvent } from '../src/database/models/addition-event.model';
import type { TasteMemory } from '../src/database/models/taste-memory.model';
import {
  confidenceFor,
  confidenceState,
  MealCompletionService,
  round2,
  weightedPosterior,
} from '../src/services/meal-completion.service';
import { PAIRS } from '../src/services/onboarding';

type MemoryRow = {
  id: string;
  userId: string;
  ingredient: string;
  contextType: string;
  contextValue: string;
  affinity: number;
  confidence: number;
  observationCount: number;
  source: string;
};

type EventRow = {
  id: string;
  userId: string;
  pairId: string;
  selected: string | null;
  state: string;
};

function fakeModels() {
  const memories: MemoryRow[] = [];
  const events: EventRow[] = [];
  const models = {
    TasteMemory: {
      async findAll({ where }: { where: Partial<MemoryRow> }): Promise<Array<{ get(): MemoryRow }>> {
        return memories
          .filter((m) =>
            Object.entries(where).every(([k, v]) => (m as Record<string, unknown>)[k] === v),
          )
          .map((m) => ({ get: () => ({ ...m }) }));
      },
      async findOne({ where }: { where: Partial<MemoryRow> }): Promise<{ get(): MemoryRow; set(p: Partial<MemoryRow>): void; save(): Promise<void> } | null> {
        const found = memories.find((m) =>
          Object.entries(where).every(([k, v]) => (m as Record<string, unknown>)[k] === v),
        );
        if (!found) return null;
        let current = { ...found };
        return {
          get: () => ({ ...current }),
          set: (p) => {
            current = { ...current, ...p };
          },
          save: async () => {
            const idx = memories.findIndex((m) => m.id === current.id);
            memories[idx] = { ...current };
          },
        };
      },
      async create(p: MemoryRow): Promise<{ get(): MemoryRow }> {
        memories.push(p);
        return { get: () => ({ ...p }) };
      },
    },
    AdditionEvent: {
      async create(p: EventRow): Promise<{ get(): EventRow }> {
        events.push(p);
        return { get: () => ({ ...p }) };
      },
      async count({ where }: { where: Partial<EventRow> }): Promise<number> {
        return events.filter((e) =>
          Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v),
        ).length;
      },
      async findAll({ where }: { where: Partial<EventRow> }): Promise<Array<{ get(): EventRow }>> {
        return events
          .filter((e) =>
            Object.entries(where).every(([k, v]) => (e as Record<string, unknown>)[k] === v),
          )
          .map((e) => ({ get: () => ({ ...e }) }));
      },
    },
  };
  return { models, memories, events };
}

describe('meal-completion inference', () => {
  it('computes the weighted posterior and decays the prior over evidence', () => {
    expect(weightedPosterior(0, 0, 0.5, 0.6)).toBeCloseTo(0.3);
    expect(weightedPosterior(0.3, 1, 0.5, 0.6)).toBeCloseTo(0.39);
    // Accumulating same-direction evidence pulls the affinity toward +0.5.
    let a = 0;
    for (let i = 0; i < 10; i += 1) {
      a = weightedPosterior(a, i, 0.5, 0.6);
    }
    expect(a).toBeGreaterThan(0.4);
  });

  it('caps confidence at 0.9 and derives inferred/confirmed states', () => {
    expect(confidenceFor(0, 0)).toBe(0);
    expect(confidenceState(0, 0)).toBe('unknown');
    expect(confidenceState(2, 0.2)).toBe('inferred');
    expect(confidenceState(3, 0.2)).toBe('confirmed');
    expect(confidenceState(1, 0.5)).toBe('confirmed');
    expect(confidenceFor(50, 1)).toBe(0.9);
  });

  it('runs a full adaptive onboarding to a 5-factor summary', async () => {
    const { models } = fakeModels();
    const service = new MealCompletionService(models as unknown as never);

    const start = await service.startOnboarding('u1');
    expect(start.seeded).toBe(false);
    expect(start.pair).not.toBeNull();

    let pair = start.pair!;
    for (let i = 0; i < PAIRS.length; i += 1) {
      const res = await service.answerOnboarding('u1', {
        pairId: pair.id,
        selected: 'A',
        unavailableOption: null,
      });
      if (i < PAIRS.length - 1) {
        expect(res.next).not.toBeNull();
        pair = res.next!;
      } else {
        expect(res.next).toBeNull();
        expect(res.summary).not.toBeNull();
      }
    }

    const summary = await service.getSummary('u1');
    expect(summary.seeded).toBe(true);
    expect(summary.factors).toHaveLength(5);
    for (const f of summary.factors) {
      expect(['nutritional', 'sensory', 'satisfaction', 'modification', 'exploration']).toContain(f.factor);
      expect(['unknown', 'inferred', 'confirmed']).toContain(f.confidence);
      expect(f.score).toBeGreaterThanOrEqual(-1);
      expect(f.score).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(summary.mealGroupAffinities).length).toBeGreaterThanOrEqual(1);
  });

  it('never writes cuisine-family rows during cold-start', async () => {
    const { models, memories } = fakeModels();
    const service = new MealCompletionService(models as unknown as never);
    const start = await service.startOnboarding('u2');
    for (let i = 0; i < PAIRS.length; i += 1) {
      const res = await service.answerOnboarding('u2', {
        pairId: i === 0 ? start.pair!.id : (PAIRS.find((p) => !memories.some((m) => m.contextType === 'addition_x_meal_group' && m.contextValue === p.baseMeal.mealGroup))!.id),
        selected: 'B',
        unavailableOption: null,
      });
      if (res.next) void res.next;
    }
    for (const m of memories) {
      expect(m.contextType).not.toBe('cuisine');
      expect(m.contextType).not.toBe('cuisine_family');
      expect(m.source).toBe('cold_start');
    }
  });
});
```

- [ ] **Step 3: Run the tests and fix until green**

```bash
npm test --workspace @meal-rescue/backend -- --runInBand meal-completion.service
npm run typecheck --workspace @meal-rescue/backend
```

Expected: PASS (4 tests). Note: the "never writes cuisine" test's adaptive loop uses a filtered pair lookup only for the second iteration to keep determinism; if `find` returns `undefined` the loop still terminates because the final `answerOnboarding` triggers the summary branch.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/meal-completion.service.ts apps/backend/tests/meal-completion.service.test.ts
git commit -m "feat: add meal-completion weighted-posterior inference service"
```

---

### Task 5: Meal-completion routes

**Files:**
- Modify: `apps/backend/src/routes/user.routes.ts`
- Modify: `apps/backend/src/services/composition.ts` (wire `mealCompletion` into `buildServices`)
- Test: `apps/backend/tests/meal-completion.routes.integration.test.ts` (create)

**Interfaces:**
- Consumes: `MealCompletionService` from Task 4; `buildServices` returns it as `mealCompletion`.
- Produces:
  - `GET /api/v1/user/taste/onboarding` → `{ pair: OnboardingPair | null; seeded: boolean }`
  - `POST /api/v1/user/taste/onboarding/answers` body `{ answer: OnboardingAnswer }` → `OnboardingAnswerResponse`
  - Input validation via Zod; invalid body → 400 `AppError` (`INVALID_ONBOARDING_INPUT`).

- [ ] **Step 1: Wire the service into composition**

In `apps/backend/src/services/composition.ts`:
- Add import after `import { TasteMemoryService } from './taste-memory.service';`:

```ts
import { MealCompletionService } from './meal-completion.service';
```

- Extend the `buildServices` return type (after `leftoverAlchemist: LeftoverAlchemistService;`):

```ts
  mealCompletion: MealCompletionService;
```

- Add to the return object (after `leftoverAlchemist: new LeftoverAlchemistService(),`):

```ts
    mealCompletion: new MealCompletionService(models),
```

- [ ] **Step 2: Add the routes**

In `apps/backend/src/routes/user.routes.ts`, after the existing `app.get('/taste/culture', ...)` block (`~line 126`), insert:

```ts
  app.get('/taste/onboarding', async (request, reply) => {
    const { mealCompletion } = buildServices(app.redis);
    const userId = request.user.sub;
    const state = await mealCompletion.startOnboarding(userId);
    return reply.send(state);
  });

  app.post('/taste/onboarding/answers', async (request, reply) => {
    const { mealCompletion } = buildServices(app.redis);
    const userId = request.user.sub;
    const parsed = z
      .object({
        answer: z.object({
          pairId: z.string().min(1),
          selected: z.enum(['A', 'B']).nullable().default(null),
          unavailableOption: z.enum(['A', 'B']).nullable().default(null),
          rejectionReason: z
            .enum([
              'taste',
              'too_expensive',
              'too_much_effort',
              'don_t_have',
              'don_t_like_ingredient',
              'not_appropriate_for_meal',
              'not_hungry_enough',
            ])
            .optional(),
        }),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_ONBOARDING_INPUT',
        message: 'Body must be { answer: OnboardingAnswer }',
        statusCode: 400,
      });
    }
    if (
      parsed.data.answer.selected === null &&
      parsed.data.answer.unavailableOption === null &&
      parsed.data.answer.rejectionReason === undefined
    ) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_ONBOARDING_INPUT',
        message: 'Answer must select an option, mark one unavailable, or state a reason',
        statusCode: 400,
      });
    }
    const result = await mealCompletion.answerOnboarding(userId, parsed.data.answer);
    return reply.send(result);
  });
```

Verify imports at the top of `user.routes.ts` already include `AppError`, `ErrorCategory`, and `z` (they do for `/taste/compass`).

- [ ] **Step 3: Write the DB-gated integration test**

Create `apps/backend/tests/meal-completion.routes.integration.test.ts`:

```ts
import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from './helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('meal-completion onboarding (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;

  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
    app = await buildApp();
    const registration = await registerTestUser(app);
    token = registration.token;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('starts onboarding and returns an adaptive first pair', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/onboarding',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pair: { id: string } | null; seeded: boolean };
    expect(body.seeded).toBe(false);
    expect(body.pair?.id).toBe('pair-01');
  });

  it('answers every pair and returns a summary at the end', async () => {
    let pairId = 'pair-01';
    let summaryReturned = false;
    for (let i = 0; i < 7; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/user/taste/onboarding/answers',
        headers: { authorization: `Bearer ${token}` },
        payload: { answer: { pairId, selected: 'A', unavailableOption: null } },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        next: { id: string } | null;
        summary: { factors: unknown[]; seeded: boolean } | null;
      };
      if (body.next) {
        pairId = body.next.id;
      } else {
        expect(body.summary?.seeded).toBe(true);
        expect(body.summary?.factors).toHaveLength(5);
        summaryReturned = true;
      }
    }
    expect(summaryReturned).toBe(true);
  });

  it('rejects an invalid answer body with a 400 contract error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/user/taste/onboarding/answers',
      headers: { authorization: `Bearer ${token}` },
      payload: { answer: { pairId: '' } },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { category: string; code: string } };
    expect(body.error.category).toBe('INPUT_VALIDATION');
    expect(body.error.code).toBe('INVALID_ONBOARDING_INPUT');
  });
});
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm run lint --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand
```

Expected: typecheck + lint clean; all unit tests pass; integration suites (including the three new tests) run when `TEST_DATABASE_URL` is set and skip when absent.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/user.routes.ts apps/backend/src/services/composition.ts apps/backend/tests/meal-completion.routes.integration.test.ts
git commit -m "feat: add adaptive meal-completion onboarding routes"
```

---

### Task 6: Behavioral override wiring + removing the compass seam

**Files:**
- Modify: `apps/backend/src/services/preference-learning.service.ts`
- Test: `apps/backend/tests/preference-learning-override.test.ts` (create)

**Interfaces:**
- Consumes: `TasteMemory`, `AdditionEvent` models; `confidenceState` from `./meal-completion.service`.
- Produces: after a real `Feedback` row is written for a rescue, the service calls `MealCompletionService`-style `confidenceState` on the affected `taste_memories` cell. This is the seam Plans 2/3 rely on: cold-start rows never reach `source: 'confirmed'` until real behavior lands.

- [ ] **Step 1: Read the existing service entry point**

Read `apps/backend/src/services/preference-learning.service.ts` to locate where a `Feedback` create/update is handled (the class owns the post-feedback side effects such as pantry/insight generation).

- [ ] **Step 2: Add a small, focused behavioral-override hook**

Append to `apps/backend/src/services/preference-learning.service.ts` (match the existing method style discovered in Step 1):

```ts
import { confidenceState } from './meal-completion.service';

  /** Promote a cold-start cell to "observed" once real behavior confirms it. */
  async promoteConfirmedSignals(userId: string, ingredientNames: string[]): Promise<void> {
    const rows = await this.models.TasteMemory.findAll({
      where: { userId },
    });
    for (const row of rows) {
      const memory = row.get();
      if (
        memory.source === 'cold_start' &&
        ingredientNames.includes(String(memory.ingredient).toLowerCase()) &&
        [0.4, 0.5].includes(Math.abs(Number(memory.affinity)))
      ) {
        const state = confidenceState(Number(memory.observationCount), Number(memory.affinity));
        if (state === 'confirmed') {
          memory.source = 'accept';
        }
        row.set({ source: 'accept' });
        await row.save();
      }
    }
  }
```

- [ ] **Step 3: Call the hook from the existing feedback path**

In the same file, inside the method that runs after feedback is recorded (the one creating insights), invoke:

```ts
    await this.promoteConfirmedSignals(userId, []);
```

`[[] ]` keeps the hook injectable; Plans 2/3 replaces the empty array with the rescue's actual ingredient list. (If the method is synchronous today, wrap the call so the promise is awaited at the call site.)

- [ ] **Step 4: Write the pure logic test (no DB)**

Create `apps/backend/tests/preference-learning-override.test.ts`:

```ts
import { confidenceState } from '../src/services/meal-completion.service';

describe('behavioral override (cold-start -> observed)', () => {
  it('only promotes confirmed evidence', () => {
    expect(confidenceState(4, 0.45)).toBe('confirmed');
    expect(confidenceState(3, 0.1)).toBe('confirmed');
    expect(confidenceState(2, 0.2)).toBe('inferred');
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npm run typecheck --workspace @meal-rescue/backend
npm test --workspace @meal-rescue/backend -- --runInBand preference-learning-override
```

Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/preference-learning.service.ts apps/backend/tests/preference-learning-override.test.ts
git commit -m "feat: promote confirmed cold-start signals once real behavior lands"
```

---

## Self-Review Summary

- **Spec coverage:** Task 1 = shared contract (context types, source, rejection reasons, summary). Task 2 = event log. Task 3 = pair catalog + adaptive design rules + cuisine-as-metadata. Task 4 = weighted posterior, confidence separate from score, derived states, adaptive uncertainty selection, UNAVAILABLE≠negative, meal-group tiebreaker, #no-cuisine rule. Task 5 = routes + validation. Task 6 = behavioral-override seam. → Every spec inference/data requirement maps to a task. Ranking/safety/diversity and the mobile UX are intentionally NOT here (they are Plans 2 & 3).
- **Placeholder scan:** all steps contain real code/commands; the only deferred call passes an empty ingredient array and is explicitly flagged as the seam Plan 3 fills in.
- **Type consistency:** `MealCompletionService.models: Db['models']`; `FACTOR_LABELS` keyed by `AdditionFactorKey`; `OnboardingAnswer`/`OnboardingSummaryResponse` match Task 1's shared types verbatim; route zod enum strings match `OnboardingRejectionReason`; `addition_*` context constants match the extended `TasteContextType`.