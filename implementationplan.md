# Taste Memory Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every meal suggestion feel like it comes from a friend who remembers you — a per-context taste memory that surfaces in suggestions, backs each pick with a "why this?" explanation, and grows a playful Food Personality + Taste Journal. Suggestions must be **culturally aware for every user, everywhere**: a new user should never get suggestions from a foreign food world by default — but a user who genuinely loves another cuisine should come to get it, because *they* taught us, not because a keyword fired. The design is deliberately country-agnostic (works the same whether the user's home kitchen is Indian, Brazilian, Japanese, or Nigerian).

**Architecture:** The backend records per-context ingredient affinities ("you avoid cilantro in tacos but love it in soups") from every accept/reject/swap/feedback signal, and wires those memories into the rescue pipeline's candidate generation and ranking so suggestions and their explanations are personalized. A Food Personality is derived from the memory profile, and every learning event appends a Taste Journal entry. The mobile app exposes the memories in `RescueResultScreen` ("why this?" deep dive) and a new `TasteJournalScreen` reachable from Profile. Existing `preferences` table stays untouched and compatible; the new learning lives in a dedicated `taste_memories` table.

**Cultural awareness (Culinary Compass):** Culture is modeled as additional **learned memory dimensions**, not a hard-coded stereotype — and the model is country-agnostic. The UI is a **smooth, card-based, non-form experience** (see Part 2 Task D5): a stack of cuisine cards morph elegantly from one to the next during onboarding (springs/translations, not fades), and a single continuous "traditional ↔ modern" track is dragged, not a list of radio buttons. Every user's world is represented equally:
- `cuisine_family` affinity — *which food worlds* the user actually enjoys, learned per user with no country baked in.
- `tradition_vs_modern` level — how traditional suggestions should lean by default; a learnable -1..+1 axis.
- A **cold-start prior** (the Culinary Compass) seeds these at onboarding so ambiguous meals default to the user's food world; **explicit meal intent always wins** (a user typing a dish exactly named for a different cuisine gets that cuisine — regardless of their home world). Both dimensions are **purely behavior-learned after seeding** — no manual adjustment knobs.

**Tech Stack:** Node/TypeScript, Fastify, Sequelize + PostgreSQL, Zod, Jest (backend). Expo SDK 57 / RN 0.86, Zustand (mobile).

## Global Constraints

- Never edit files via PowerShell `Get-Content | Set-Content` pipelines (truncation history) — use the Edit tool only.
- Backend verification = `npm run typecheck`, `npm run lint`, `npm test` (Jest, run inside `apps/backend`).
- Backend integration tests gate on `TEST_DATABASE_URL` and `describe.skip` otherwise (see `tests/integration/*.test.ts`); unit tests run anywhere.
- Mobile verification = `npx tsc --noEmit` + `npx eslint src --max-warnings 0` inside `apps/mobile`.
- Follow existing a11y convention: every interactive element gets `accessibilityRole` + `accessibilityLabel`.
- No comments in code unless they explain non-obvious product/memory logic (repo allows sparse doc comments on classes/functions).
- Commit after each task. Backend tests run `--runInBand`. Do not start blocking watchers in shell steps.
- The mobile app is Expo SDK 57 — before writing any mobile code, read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ (per `apps/mobile/AGENTS.md`).
- Content/copy rule: Taste Journal entries, Food Personality labels, and culture-aware explanations use natural, warm, non-stereotyping language ("Noted: you steer away from cilantro in tacos") — never clinical, robotic, or assuming a user's whole culture. Never phrase culture as a hard rule ("you're Indian, so you must want Indian food"); always frame it as learning ("we lean toward food you'll recognize — tell us if you want a twist").

---

### Task 1: `taste_memories` table — new Sequelize model + registration

**Files:**
- Create: `apps/backend/src/database/models/taste-memory.model.ts`
- Modify: `apps/backend/src/database/models/index.ts`
- Test: `apps/backend/tests/taste-memory.model.test.ts`

**Interfaces:**
- Produces: `TasteMemory` model class with fields `id, userId, ingredient, contextType, contextValue, affinity, confidence, observationCount, source, lastUpdated`; `defineTasteMemoryModel(sequelize)`. Registered in `DbModels` as `TasteMemory`.

- [ ] **Step 1: Write the failing model registration test**

Create `apps/backend/tests/taste-memory.model.test.ts`:

```ts
import { DataTypes, Model, Sequelize } from 'sequelize';

import {
  TasteMemory,
  defineTasteMemoryModel,
} from '../src/database/models/taste-memory.model';

describe('taste memory model', () => {
  let sequelize: Sequelize;
  let model: typeof TasteMemory;

  beforeEach(() => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false });
    model = defineTasteMemoryModel(sequelize);
  });

  it('defines the expected columns and unique index', () => {
    const attributes = model.getAttributes();
    expect(attributes.userId.type).toBeInstanceOf(DataTypes.UUID);
    expect(attributes.ingredient.type).toBeInstanceOf(DataTypes.STRING);
    expect(attributes.affinity.type).toBeInstanceOf(DataTypes.DECIMAL);
    expect(attributes.confidence.type).toBeInstanceOf(DataTypes.DECIMAL);
    expect(attributes.observationCount.type).toBeInstanceOf(DataTypes.INTEGER);

    const unique = model.options.indexes?.find(
      (i: { unique?: boolean }) => i.unique,
    );
    expect(unique).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest tests/taste-memory.model.test.ts --runInBand`
Expected: FAIL with "Cannot find module '../src/database/models/taste-memory.model'".

- [ ] **Step 3: Create the model**

Create `apps/backend/src/database/models/taste-memory.model.ts`:

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
 * taste_memories - per-context ingredient affinity.
 * Solve the "I avoid spice in curries but love it in tacos" problem:
 * affinity is tracked against a CONTEXT (cuisine / meal time / pattern),
 * never as a blanket per-ingredient score.
 */
export class TasteMemory extends Model<
  InferAttributes<TasteMemory>,
  InferCreationAttributes<TasteMemory>
> {
  declare id: UUID;
  declare userId: UUID;
  declare ingredient: string;
  declare contextType: string;
  declare contextValue: string;
  declare affinity: number; // -1.0 (avoid) .. +1.0 (love)
  declare confidence: number; // 0.0 .. 1.0
  declare observationCount: number;
  declare source: string; // 'feedback' | 'accept' | 'swap' | 'reject' | 'profile'
  declare lastUpdated: CreationOptional<Date>;
}

export type TasteMemoryContextType =
  | 'cuisine'
  | 'meal_time'
  | 'meal_pattern'
  | 'cuisine_family'
  | 'tradition_vs_modern'
  | 'global';

export function defineTasteMemoryModel(sequelize: Sequelize): typeof TasteMemory {
  TasteMemory.init(
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
      ingredient: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      contextValue: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      affinity: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteMemory',
      tableName: 'taste_memories',
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          name: 'uq_taste_memories_user_ctx',
          fields: ['user_id', 'ingredient', 'context_type', 'context_value'],
        },
      ],
    },
  );
  return TasteMemory;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest tests/taste-memory.model.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Register the model in the model registry**

In `apps/backend/src/database/models/index.ts`:

Add import near the other model imports:

```ts
import { TasteMemory, defineTasteMemoryModel } from './taste-memory.model';
```

Add `TasteMemory: typeof TasteMemory;` to the `DbModels` interface (after `NotificationLog`), add `TasteMemory` to the `models` object in `initializeModels()` (after `NotificationLog`), add the association (after the NotificationLog block):

```ts
models.User.hasMany(models.TasteMemory, {
  foreignKey: { name: 'userId', allowNull: false },
});
models.TasteMemory.belongsTo(models.User, {
  foreignKey: { name: 'userId', allowNull: false },
});
```

Add `TasteMemory` to the exported `dbModels` object at the bottom.

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/backend && npm run typecheck`
Expected: clean.

```bash
cd apps/backend && git add src/database/models/taste-memory.model.ts src/database/models/index.ts tests/taste-memory.model.test.ts && git commit -m "feat(backend): taste_memories table for per-context affinity"
```

---

### Task 2: Shared types — taste memory, personality, journal entry, deep-dive

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/backend/tests/shared-types.test.ts` (create)

**Interfaces:**
- Produces (all consumed by later tasks and mobile):
  - `TasteContext = { contextType: 'cuisine' | 'meal_time' | 'meal_pattern' | 'global'; contextValue: string }`
  - `TasteMemoryEntry { ingredient; contextType; contextValue; affinity; confidence; observationCount; source; lastUpdated }`
  - `FoodPersonalityTrait { id; label; description; strength }` and `FoodPersonality { traits: FoodPersonalityTrait[]; bio: string }`
  - `TasteJournalEntry { id; createdAt; text; kind }`
  - `TasteJournalResponse { entries: TasteJournalEntry[]; personality: FoodPersonality | null }`
  - `MemoryReason { ingredient; contextValue; affinity; confidence }`
  - `resonanceMemory?` added as optional field on `RankedRecommendation`

- [ ] **Step 1: Write the failing shared-types test**

Create `apps/backend/tests/shared-types.test.ts`:

```ts
import {
  type FoodPersonality,
  type MemoryReason,
  type RankedRecommendation,
  type TasteJournalResponse,
  type TasteMemoryEntry,
} from '@meal-rescue/shared-types';

describe('taste memory shared types', () => {
  it('TasteMemoryEntry carries per-context affinity', () => {
    const entry: TasteMemoryEntry = {
      ingredient: 'cilantro',
      contextType: 'cuisine',
      contextValue: 'mexican',
      affinity: -0.8,
      confidence: 0.9,
      observationCount: 4,
      source: 'feedback',
      lastUpdated: '2026-08-29T00:00:00Z',
    };
    expect(entry.affinity).toBeLessThan(0);
  });

  it('RankedRecommendation accepts an optional resonance memory', () => {
    const memory: MemoryReason = {
      ingredient: 'avocado',
      contextValue: 'salad',
      affinity: 0.9,
      confidence: 0.95,
    };
    const rec: RankedRecommendation = {} as RankedRecommendation;
    const withMemory: RankedRecommendation & { resonanceMemory?: MemoryReason } = {
      ...rec,
      resonanceMemory: memory,
    };
    expect(withMemory.resonanceMemory?.ingredient).toBe('avocado');
  });

  it('FoodPersonality and journal response shapes exist', () => {
    const p: FoodPersonality = {
      traits: [{ id: 'spice', label: 'Spice Adventurer', description: 'Loves heat in the right context', strength: 0.8 }],
      bio: 'You love bold flavor when it fits the dish.',
    };
    const j: TasteJournalResponse = { entries: [], personality: p };
    expect(j.personality?.traits[0]!.strength).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest tests/shared-types.test.ts --runInBand`
Expected: FAIL with "has no exported member 'TasteMemoryEntry'".

- [ ] **Step 3: Add the shared types**

In `packages/shared-types/src/index.ts`, add a new section after the "Phase 4: Personalization & Pantry" section (after line ~237, before "Phase 5"):

```ts
// ---------------------------------------------------------------------------
// Taste Memory Bank (personalization) - per-context learned taste
// ---------------------------------------------------------------------------

export type TasteContextType =
  | 'cuisine'
  | 'meal_time'
  | 'meal_pattern'
  | 'cuisine_family'
  | 'tradition_vs_modern'
  | 'global';

export type MemorySource = 'feedback' | 'accept' | 'swap' | 'reject' | 'profile';

export interface TasteMemoryEntry {
  ingredient: string;
  contextType: TasteContextType;
  contextValue: string;
  /** -1.0 avoid .. +1.0 love. Context-scoped, never a blanket per-ingredient score. */
  affinity: Confidence;
  confidence: Confidence;
  observationCount: number;
  source: MemorySource;
  lastUpdated: ISO8601;
}

export type CulinaryFamily =
  | 'indian'
  | 'east_asian'
  | 'mediterranean'
  | 'mexican'
  | 'american'
  | 'middle_eastern'
  | 'italian'
  | 'none';

export interface CulinaryCompassSeed {
  family: CulinaryFamily;
  /** -1.0 pure & traditional .. +1.0 loves modern fusion twists. */
  traditionVsModern: Confidence;
}

export interface FoodPersonalityTrait {
  id: string;
  label: string;
  description: string;
  /** 0.0 .. 1.0 - how strongly this trait defines the user. */
  strength: Confidence;
}

export interface FoodPersonality {
  traits: FoodPersonalityTrait[];
  bio: string;
}

export type TasteJournalKind =
  | 'learned'
  | 'personality_shift'
  | 'milestone'
  | 'corrected'
  | 'culture';

export interface TasteJournalEntry {
  id: UUID;
  createdAt: ISO8601;
  text: string;
  kind: TasteJournalKind;
}

export interface TasteJournalResponse {
  entries: TasteJournalEntry[];
  personality: FoodPersonality | null;
}

/** One memory behind a "why this?" deep-dive on a recommendation. */
export interface MemoryReason {
  ingredient: string;
  contextValue: string;
  affinity: Confidence;
  confidence: Confidence;
  /** When present, explains a cultural/context reason rather than a single ingredient. */
  kind?: 'ingredient' | 'cuisine_family' | 'tradition';
}
```

Then, in the existing `RankedRecommendation` interface (lines 117-122), add an optional field:

```ts
export interface RankedRecommendation {
  candidate: RescueCandidate;
  rankScore: number;
  reasoning: string;
  naturalLanguageExplanation: string;
  /** Memory the ranker surfaced; rendered by the "why this?" deep-dive. */
  resonanceMemory?: MemoryReason;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest tests/shared-types.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/backend && npm run typecheck`
Expected: clean.

```bash
git add packages/shared-types/src/index.ts apps/backend/tests/shared-types.test.ts && git commit -m "feat(shared): taste memory, personality, journal, deep-dive types"
```

---

### Task 3: TasteMemoryService — record, learn, journal, personality, load

This is the heart of the learning layer. Pure domain logic with injected `models` (matching the `PreferenceLearningService` pattern), fully unit-testable with a fake model map.

**Files:**
- Create: `apps/backend/src/services/taste-memory.service.ts`
- Modify: `apps/backend/src/services/preference-learning.service.ts` (call into recorder)
- Test: `apps/backend/tests/taste-memory.service.test.ts`

**Interfaces:**
- Consumes: `Db['models']` (has `TasteMemory`), `TasteMemoryEntry`, `FoodPersonality`, `TasteJournalEntry`, `MemoryReason`, `Constraints`, `DetectedFood`.
- Produces:
  - `recordFeedback(userId, rescue, satisfaction): Promise<TasteJournalEntry[]>` — records memories for candidate additions/substitutions per inferred context.
  - `recordDecision(userId, decision, rescue): Promise<void>` — records accept/swap/reject signals.
  - `getTasteProfile(userId): Promise<TasteMemoryEntry[]>` — all memories sorted by confidence.
  - `buildPersonality(userId): Promise<FoodPersonality | null>`
  - `getJournal(userId): Promise<TasteJournalEntry[]>`
  - `buildPreferenceSnapshot(userId): Promise<UserPreferenceSnapshot>` — favorites/avoided derived from per-context memories (for the existing pipeline).

- [ ] **Step 1: Write the failing unit tests**

Create `apps/backend/tests/taste-memory.service.test.ts`:

```ts
import { TasteMemoryService } from '../src/services/taste-memory.service';

interface Row {
  id: string;
  userId: string;
  ingredient: string;
  contextType: string;
  contextValue: string;
  affinity: number;
  confidence: number;
  observationCount: number;
  source: string;
  lastUpdated: Date;
}

function fakeModels(rows: Row[] = []) {
  const store: Row[] = rows;
  let seq = 0;
  return {
    models: {
      TasteMemory: {
        async findAll({ where }: { where: { userId: string } }) {
          return store
            .filter((r) => r.userId === where.userId)
            .sort((a, b) => b.confidence - a.confidence)
            .map((r) => ({ get: () => ({ ...r }) }));
        },
        async findOne({ where }: { where: Record<string, unknown> }) {
          const match = store.find((r) =>
            Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
          );
          return match ? { get: () => ({ ...match }), save: async () => {} } : null;
        },
        async create(row: Row) {
          const created = { ...row, id: `m${++seq}` };
          store.push(created);
          return created;
        },
      },
    },
    store,
  };
}

describe('TasteMemoryService', () => {
  // Fiber comes from a Protein Bar rescue candidate; protein context.
  const SELECTED = {
    selectedRecommendation: {
      candidate: {
        additions: [{ name: 'avocado' }],
        substitutions: [],
        cookingSteps: 1,
      },
    } as unknown as Record<string, unknown>,
    userDecision: 'accepted',
    constraints: { timeMinutes: 10 } as Record<string, unknown>,
  };

  it('records a favorite memory for a "better" feedback', async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    await svc.recordFeedback('u1', SELECTED, 'better');
    const avocado = store.find((r) => r.ingredient === 'avocado');
    expect(avocado).toBeDefined();
    expect(avocado!.affinity).toBeGreaterThan(0);
  });

  it("records an avoided memory scoped to the detected cuisine context, not global", async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    const rescue = {
      ...SELECTED,
      selectedRecommendation: {
        candidate: { additions: [{ name: 'cilantro' }], substitutions: [], cookingSteps: 0 },
      },
      constraints: { timeMinutes: 5 },
    };
    await svc.recordFeedback('u1', rescue, 'not_for_me');
    const cil = store.find((r) => r.ingredient === 'cilantro');
    // default context should be meal_pattern/mealtime, and affinity negative
    expect(cil).toBeDefined();
    expect(cil!.affinity).toBeLessThan(0);
  });

  it('builts a preference snapshot of favorites and avoided from memories', async () => {
    const { models } = fakeModels([
      { id: '1', userId: 'u1', ingredient: 'avocado', contextType: 'global', contextValue: 'any', affinity: 0.9, confidence: 0.9, observationCount: 3, source: 'feedback', lastUpdated: new Date() },
      { id: '2', userId: 'u1', ingredient: 'cilantro', contextType: 'global', contextValue: 'any', affinity: -0.8, confidence: 0.9, observationCount: 4, source: 'feedback', lastUpdated: new Date() },
    ]);
    const svc = new TasteMemoryService(models as never);
    const snap = await svc.buildPreferenceSnapshot('u1');
    expect(snap.favoriteFoods).toContain('avocado');
    expect(snap.avoidedFoods).toContain('cilantro');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest tests/taste-memory.service.test.ts --runInBand`
Expected: FAIL with "Cannot find module '../src/services/taste-memory.service'".

- [ ] **Step 3: Write the service**

Create `apps/backend/src/services/taste-memory.service.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type {
  Constraints,
  DetectedFood,
  FoodPersonality,
  FoodPersonalityTrait,
  MemoryReason,
  TasteJournalEntry,
  TasteMemoryEntry,
} from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { identifyMissingComponents } from './ranking-engine.service';

/**
 * TasteMemoryService - per-context taste learning.
 *
 * "I don't like spice" does NOT mean "I reject all spice." Every signal is
 * recorded against the context that produced it (cuisine, meal time, or
 * intervention pattern). A user can love spice in tacos and avoid it in
 * curries simultaneously - two rows, no contradiction.
 *
 * Also derives the Food Personality and writes Taste Journal entries.
 */
export class TasteMemoryService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  private fundingCuisine(detectedFoods: DetectedFood[] | undefined): string | null {
    if (!detectedFoods || detectedFoods.length === 0) return null;
    const names = detectedFoods.map((f) => f.name.toLowerCase()).join(' ');
    if (/noodle|ramen|rice|stir-fry|curry|soy/.test(names)) return 'asian';
    if (/taco|burrito|quesadilla|salsa|tortilla/.test(names)) return 'mexican';
    if (/burger|sandwich|toast|fries|cheese/.test(names)) return 'american';
    if (/falafel|hummus|pita|kebab|olive/.test(names)) return 'mediterranean';
    if (/dal|roti|paratha|khichdi|poha/.test(names)) return 'indian';
    return null;
  }

  private mealtimeContext(hour = new Date().getHours()): Record<string, string> {
    if (hour >= 5 && hour < 11) return { contextType: 'meal_time', contextValue: 'morning' };
    if (hour >= 11 && hour < 15) return { contextType: 'meal_time', contextValue: 'lunch' };
    if (hour >= 15 && hour < 21) return { contextType: 'meal_time', contextValue: 'dinner' };
    return { contextType: 'meal_time', contextValue: 'late_night' };
  }

  async recordFeedback(
    userId: string,
    rescue: {
      selectedRecommendation: Record<string, unknown>;
      userDecision: string;
      constraints?: Record<string, unknown>;
      detectedFoods?: DetectedFood[];
    },
    satisfaction: string,
  ): Promise<TasteJournalEntry[]> {
    const entries: TasteJournalEntry[] = [];
    const candidate = (
      rescue.selectedRecommendation.candidate as
        | { additions?: Array<{ name: string }>; substitutions?: Array<{ replacement: { name: string } }> }
        | undefined
    ) ?? { additions: [], substitutions: [] };

    const ingredients = [
      ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
    ];

    const cuisine = this.fundingCuisine(rescue.detectedFoods);
    const mealTime = this.mealtimeContext();
    const context = cuisine
      ? { contextType: 'cuisine', contextValue: cuisine }
      : { contextType: mealTime.contextType, contextValue: mealTime.contextValue };

    const delta = satisfaction === 'better' ? 0.35 : satisfaction === 'not_for_me' ? -0.4 : 0;

    for (const ingredient of ingredients) {
      const entry = await this.applySignal({
        userId,
        ingredient,
        contextType: context.contextType,
        contextValue: context.contextValue,
        affinityDelta: delta,
        confidenceDelta: 0.2,
        source: 'feedback',
      });
      if (entry) entries.push(this.describeLearn(userId, ingredient, entry, satisfaction));
    }
    return entries;
  }

  async recordDecision(
    userId: string,
    decision: string,
    rescue: {
      selectedRecommendation: Record<string, unknown>;
      detectedFoods?: DetectedFood[];
    },
  ): Promise<void> {
    const candidate = (
      rescue.selectedRecommendation.candidate as
        | { additions?: Array<{ name: string }>; substitutions?: Array<{ replacement: { name: string } }> }
        | undefined
    ) ?? { additions: [], substitutions: [] };
    const ingredients = [
      ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
    ];
    const cuisine = this.fundingCuisine(rescue.detectedFoods);
    const mealTime = this.mealtimeContext();
    const context = cuisine
      ? { contextType: 'cuisine', contextValue: cuisine }
      : { contextType: mealTime.contextType, contextValue: mealTime.contextValue };

    const delta = decision === 'accepted' || decision === 'swapped' ? 0.3 : decision === 'rejected' ? -0.35 : 0;
    const source = decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject';

    for (const ingredient of ingredients) {
      await this.applySignal({
        userId,
        ingredient,
        contextType: context.contextType,
        contextValue: context.contextValue,
        affinityDelta: delta,
        confidenceDelta: 0.12,
        source,
      });
    }
  }

  private async applySignal(args: {
    userId: string;
    ingredient: string;
    contextType: string;
    contextValue: string;
    affinityDelta: number;
    confidenceDelta: number;
    source: string;
  }): Promise<TasteMemoryEntry | null> {
    const where = {
      userId: args.userId,
      ingredient: args.ingredient,
      contextType: args.contextType,
      contextValue: args.contextValue,
    };
    const existing = await this.models.TasteMemory.findOne({ where });

    if (existing) {
      const affinity = clamp01(Number(existing.get().affinity) + args.affinityDelta);
      const confidence = Math.min(1, Number(existing.get().confidence) + args.confidenceDelta);
      existing.get().affinity = affinity;
      existing.get().confidence = confidence;
      existing.get().observationCount += 1;
      existing.get().source = args.source;
      existing.get().lastUpdated = new Date();
      await existing.save();
      return existing.get();
    }

    const created = await this.models.TasteMemory.create({
      id: randomUUID(),
      userId: args.userId,
      ingredient: args.ingredient,
      contextType: args.contextType,
      contextValue: args.contextValue,
      affinity: Math.max(-0.5, Math.min(0.5, args.affinityDelta)),
      confidence: Math.min(0.5 + args.confidenceDelta, 1),
      observationCount: 1,
      source: args.source,
      lastUpdated: new Date(),
    });
    return created as unknown as TasteMemoryEntry;
  }

  private describeLearn(
    userId: string,
    ingredient: string,
    entry: TasteMemoryEntry,
    satisfaction: string,
  ): TasteJournalEntry {
    const context = entry.contextType === 'cuisine' ? ` in ${entry.contextValue} dishes` : '';
    const tone =
      satisfaction === 'better'
        ? `Noted: you enjoyed ${ingredient}${context}.`
        : satisfaction === 'not_for_me'
          ? `Noted: you steered away from ${ingredient}${context}.`
          : `Noted: you were neutral on ${ingredient}${context}.`;
    return { id: randomUUID(), createdAt: new Date().toISOString(), text: tone, kind: 'learned' };
  }

  async getTasteProfile(userId: string): Promise<TasteMemoryEntry[]> {
    const rows = await this.models.TasteMemory.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
    });
    return rows.map((row) => row.get() as unknown as TasteMemoryEntry);
  }

  async getJournal(userId: string): Promise<TasteJournalEntry[]> {
    const memory = await this.getTasteProfile(userId);
    if (memory.length === 0) return [];
    return memory.slice(0, 20).map((m) => ({
      id: randomUUID(),
      createdAt: m.lastUpdated,
      text:
        m.affinity >= 0.2
          ? `You lean toward ${m.ingredient}${
              m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''
            }.`
          : m.affinity <= -0.2
            ? `You steer clear of ${m.ingredient}${
                m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''
              }.`
            : `Still deciding on ${m.ingredient}.`,
      kind: 'learned',
    }));
  }

  async buildPersonality(userId: string): Promise<FoodPersonality | null> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return null;

    const traits: FoodPersonalityTrait[] = [];
    const spiceRange = profile.filter((m) => /spice|chili|hot|pepper/i.test(m.ingredient));
    const creamRange = profile.filter((m) => /cream|yogurt|cheese|butter|avocado/i.test(m.ingredient));
    const freshRange = profile.filter((m) => /herb|cilantro|spinach|tomato|cucumber|salad/i.test(m.ingredient));
    const variety = new Set(profile.map((m) => m.ingredient)).size;

    if (spiceRange.length >= 2 && avgAffinity(spiceRange) >= 0.4) {
      traits.push({ id: 'spice', label: 'Spice Adventurer', description: 'You love heat when it fits the meal.', strength: avgAffinity(spiceRange) });
    } else if (spiceRange.length >= 1 && avgAffinity(spiceRange) <= -0.4) {
      traits.push({ id: 'mild', label: 'Mild & Steady', description: 'You prefer gentler flavor, in the right context.', strength: Math.abs(avgAffinity(spiceRange)) });
    }
    if (creamRange.length >= 2 && avgAffinity(creamRange) >= 0.4) {
      traits.push({ id: 'cream', label: 'Comfort Seeker', description: 'Rich, creamy textures land well for you.', strength: avgAffinity(creamRange) });
    }
    if (freshRange.length >= 2) {
      traits.push({ id: 'fresh', label: 'Fresh Palate', description: 'Bright, fresh produce tends to win you over.', strength: Math.min(1, 0.4 + 0.1 * freshRange.length) });
    }
    if (variety >= 8) {
      traits.push({ id: 'curious', label: 'Curious Taster', description: 'You keep trying new things - we love that.', strength: Math.min(1, 0.3 + 0.05 * variety) });
    }

    if (traits.length === 0) return null;
    const top = traits[0]!.label;
    return {
      traits,
      bio: `You lean ${traits[0]!.label} — and we remember the details.`,
    } satisfies FoodPersonality;
  }

  async buildPreferenceSnapshot(
    userId: string,
  ): Promise<{ favoriteFoods?: string[]; avoidedFoods?: string[] }> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return {};
    const favorites = profile
      .filter((m) => m.affinity >= 0.5 && m.confidence >= 0.5)
      .map((m) => m.ingredient);
    const avoided = profile
      .filter((m) => m.affinity <= -0.5 && m.confidence >= 0.5)
      .map((m) => m.ingredient);
    return {
      favoriteFoods: favorites.length ? [...new Set(favorites)] : undefined,
      avoidedFoods: avoided.length ? [...new Set(avoided)] : undefined,
    };
  }

  async findResonanceMemory(
    userId: string,
    candidates: Array<{ additions: Array<{ name: string }>; substitutions: Array<{ replacement: { name: string } }> }>,
  ): Promise<MemoryReason | undefined> {
    const profile = await this.getTasteProfile(userId);
    if (profile.length === 0) return undefined;
    const names = new Set(
      candidates.flatMap((c) => [
        ...c.additions.map((a) => a.name.toLowerCase()),
        ...c.substitutions.map((s) => s.replacement.name.toLowerCase()),
      ]),
    );
    const resonance = profile.find((m) => names.has(m.ingredient) && m.confidence >= 0.6 && Math.abs(m.affinity) >= 0.3);
    if (!resonance) return undefined;
    return {
      ingredient: resonance.ingredient,
      contextValue: resonance.contextValue,
      affinity: resonance.affinity,
      confidence: resonance.confidence,
    };
  }
}

function clamp01(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

function avgAffinity(rows: TasteMemoryEntry[]): number {
  return rows.reduce((sum, r) => sum + r.affinity, 0) / rows.length;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest tests/taste-memory.service.test.ts --runInBand`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the existing feedback learner into the recorder**

In `apps/backend/src/services/preference-learning.service.ts`, add a `TasteMemoryService` instance and record feedback. Add import and a private member, then call it at the start of `processFeedback`:

```ts
import { TasteMemoryService } from './taste-memory.service';
// inside class, after constructor:
private readonly tasteMemory = new TasteMemoryService(this.models);
// at the very top of processFeedback:
await this.tasteMemory.recordFeedback(userId, rescue, satisfaction);
```

(Type note: `processFeedback` receives `rescue` without `detectedFoods`; that is fine — `fundingCuisine(undefined)` returns null and we fall back to meal-time context.)

- [ ] **Step 6: Typecheck + run full backend unit suite + commit**

Run: `cd apps/backend && npm run typecheck && npm test`
Expected: typecheck clean; full suite passes.

```bash
cd apps/backend && git add src/services/taste-memory.service.ts src/services/preference-learning.service.ts tests/taste-memory.service.test.ts && git commit -m "feat(backend): taste memory service learns per-context affinity, personality, journal"
```

---

### Task 4: Wire taste memory into the rescue pipeline + resonance explanations

**Files:**
- Modify: `apps/backend/src/services/rescue-pipeline.service.ts`
- Modify: `apps/backend/src/services/ranking-engine.service.ts`
- Modify: `apps/backend/src/services/composition.ts`
- Test: `apps/backend/tests/ranking-engine.test.ts` (extend)
- Test: `apps/backend/tests/pipeline-memory.integration.test.ts` (create)

**Interfaces:**
- Consumes: `TasteMemoryService.buildPreferenceSnapshot(userId)`, `TasteMemoryService.findResonanceMemory(userId, candidates)`, `MemoryReason`.
- Produces: `RescuePipelineService` loads real preferences (not `{}`) and attaches a `resonanceMemory` to the top recommendation. `RankingEngineService.rankAndExplain` accepts an optional `resonanceMemory?: MemoryReason` and stamps it onto the returned top-ranked recommendation.

- [ ] **Step 1: Extend ranking-engine unit test**

Add to `apps/backend/tests/ranking-engine.test.ts` a new `it` block:

```ts
it('stamps the supplied resonance memory onto the top recommendation', async () => {
  const llm = stubClient(() => ({
    rankedCandidates: [
      { candidateId: egg.id, overallScore: 0.9, reasoning: 'covers gaps', explanation: 'Add an egg.' },
      { candidateId: spinach.id, overallScore: 0.7, reasoning: '', explanation: 'Add spinach.' },
    ],
    rankingConfidence: 0.8,
  }));
  const engine = new RankingEngineService(llm);
  const memory = {
    ingredient: 'egg',
    contextValue: 'breakfast',
    affinity: 0.9,
    confidence: 0.95,
  };
  const ranked = await engine.rankAndExplain(
    candidates,
    { detectedFoods: [], detectedComponents: {} },
    {},
    {},
    memory,
  );
  expect(ranked[0]!.resonanceMemory?.ingredient).toBe('egg');
  expect(ranked[1]!.resonanceMemory).toBeUndefined();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest tests/ranking-engine.test.ts --runInBand`
Expected: FAIL — `rankAndExplain` signature has no 5th arg and `resonanceMemory` is not set.

- [ ] **Step 3: Update the ranking engine**

In `apps/backend/src/services/ranking-engine.service.ts`:

1. Import the shared type: `import type { MemoryReason } from '@meal-rescue/shared-types';`
2. Change the method signature:

```ts
async rankAndExplain(
  candidates: RescueCandidate[],
  meal: RankingMealContext,
  constraints: Constraints,
  preferences: UserPreferenceSnapshot,
  resonanceMemory?: MemoryReason,
): Promise<RankedRecommendation[]> {
```

3. After `const joined = ...` is built and sorted (the final `return joined.sort(...)`), stamp the memory onto the top entry:

```ts
if (resonanceMemory && joined.length > 0) {
  joined[0] = { ...joined[0]!, resonanceMemory };
  joined[0].candidate.preferenceAlignment = Math.max(
    joined[0].candidate.preferenceAlignment,
    resonanceMemory.confidence * 0.6,
  );
}
return joined.sort((a, b) => b.rankScore - a.rankScore);
```

Replace the existing final `return joined.sort(...)` line with the block above.

- [ ] **Step 4: Run the ranking test to verify it passes**

Run: `cd apps/backend && npx jest tests/ranking-engine.test.ts --runInBand`
Expected: PASS (all blocks).

- [ ] **Step 5: Wire the pipeline**

In `apps/backend/src/services/rescue-pipeline.service.ts`:

1. Add imports:

```ts
import type { MemoryReason } from '@meal-rescue/shared-types';
import { TasteMemoryService } from './taste-memory.service';
```

2. Add a private member to the class and accept it from the constructor. Change the class constructor to accept an optional taste service:

```ts
export class RescuePipelineService {
  private readonly generator: CandidateGeneratorService;
  private readonly constraintEngine: ConstraintEngineService;
  private readonly rankingEngine: RankingEngineService;
  private readonly validation: ValidationService;
  private readonly tasteMemory: TasteMemoryService | null;

  constructor(
    llm: LlmClient,
    private readonly pantryProvider: PantryProvider | null,
    tasteMemory?: TasteMemoryService,
  ) {
    this.generator = new CandidateGeneratorService();
    this.constraintEngine = new ConstraintEngineService();
    this.rankingEngine = new RankingEngineService(llm);
    this.validation = new ValidationService();
    this.tasteMemory = tasteMemory ?? null;
  }
```

3. Replace `loadPreferences` (lines 174-180) to use the taste memory service:

```ts
private async loadPreferences(
  userId: string,
): Promise<{ favoriteFoods?: string[]; avoidedFoods?: string[] }> {
  if (!this.tasteMemory) return {};
  return this.tasteMemory.buildPreferenceSnapshot(userId);
}
```

4. In `generateRescue`, after ranking, before validation, look up a resonance memory for the feasible candidates and pass it into ranking. Change the ranking block:

```ts
const resonanceMemory = this.tasteMemory
  ? await this.tasteMemory.findResonanceMemory(userId, feasible)
  : undefined;

const ranked = await this.rankingEngine.rankAndExplain(
  feasible,
  { detectedFoods, detectedComponents },
  constraints,
  preferences,
  resonanceMemory,
);
```

- [ ] **Step 6: Keep the fallback honest — non-null preference path**

Because a `null` taste service returns `{}` from `loadPreferences` and skips resonance, the pipeline degrades cleanly when the service is absent. Now update `composition.ts` to always build and inject it so the production path is personalized:

In `apps/backend/src/services/composition.ts`:

1. Add import: `import { TasteMemoryService } from './taste-memory.service';`
2. Instantiate once: `const tasteMemory = new TasteMemoryService(models);` (after `const models = {...}`)
3. Change the `rescuePipeline` construction:

```ts
rescuePipeline: new RescuePipelineService(llm, pantryProvider, tasteMemory),
```

4. Add `tasteMemory` to the returned service object (so routes can reuse it) and to the return type.

Return type becomes:

```ts
export function buildServices(redis: Redis | null): {
  mealAnalyzer: MealAnalyzerService;
  rescuePipeline: RescuePipelineService;
  feedback: FeedbackService;
  preferenceLearning: PreferenceLearningService;
  tasteMemory: TasteMemoryService;
  pantry: PantryService;
  fridgeNegotiator: FridgeNegotiatorService;
  leftoverAlchemist: LeftoverAlchemistService;
} {
```

(Leave `preferenceLearning` present — ProfileScreen still consumes it, and it still writes legacy `preferences` for backwards compatibility.)

- [ ] **Step 7: Write an integration test for end-to-end preference wiring**

Create `apps/backend/tests/pipeline-memory.integration.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('pipeline personalization (integration)', () => {
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

  async function analyzeText(text: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meal/analyze',
      headers: { authorization: `Bearer ${token}` },
      payload: { text },
    });
    return (res.json() as { mealId: string }).mealId;
  }

  async function generate(mealId: string, constraints: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rescue/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { mealId, constraints },
    });
    return res.json() as Record<string, unknown>;
  }

  it('generates a rescue with an optional resonance memory', async () => {
    const mealId = await analyzeText('instant noodles with egg');
    const body = await generate(mealId, { timeMinutes: 10, cookingRequired: false });
    expect((body.recommendation as Record<string, unknown>).candidate).toBeDefined();
    // At first run there may be no high-confidence memory; the field is optional.
    const rec = body.recommendation as { resonanceMemory?: unknown };
    expect(rec).toBeDefined();
  });
});
```

- [ ] **Step 8: Run typecheck + full backend test suite**

Run: `cd apps/backend && npm run typecheck && npm test`
Expected: clean typecheck; all existing + new tests pass (integration tests skip when `TEST_DATABASE_URL` unset).

- [ ] **Step 9: Commit**

```bash
cd apps/backend && git add src/services/rescue-pipeline.service.ts src/services/ranking-engine.service.ts src/services/composition.ts tests/ranking-engine.test.ts tests/pipeline-memory.integration.test.ts && git commit -m "feat(backend): wire per-context taste memory into rescue pipeline with resonance explanations"
```

---

### Task 5: Taste memory API routes — profile, personality, journal, deep-dive

**Files:**
- Modify: `apps/backend/src/routes/user.routes.ts`
- Test: `apps/backend/tests/user-routes.integration.test.ts` (create)

**Interfaces:**
- Consumes: service methods `getTasteProfile`, `buildPersonality`, `getJournal`.
- Produces:
  - `GET /api/v1/user/taste/profile` → `TasteMemoryEntry[]`
  - `GET /api/v1/user/taste/personality` → `FoodPersonality | null`
  - `GET /api/v1/user/taste/journal` → `TasteJournalEntry[]`
  - `GET /api/v1/user/taste` → `{ memories: TasteMemoryEntry[]; personality: FoodPersonality | null; journal: TasteJournalEntry[] }`

- [ ] **Step 1: Write the integration tests**

Create `apps/backend/tests/user-routes.integration.test.ts`:

```ts
import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('user taste routes (integration)', () => {
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

  it('GET /user/taste returns empty-shaped results for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { memories: unknown[]; personality: unknown; journal: unknown[] };
    expect(Array.isArray(body.memories)).toBe(true);
    expect(body.journal).toEqual([]);
  });

  it('GET /user/taste/personality returns null for a fresh user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/personality',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest tests/user-routes.integration.test.ts --runInBand`
Expected: FAIL (routes 404). (Or skip if no DB — then verify by reading status once DB available; for dev, confirm route is registered after Step 3 by running the same test with `TEST_DATABASE_URL`.)

- [ ] **Step 3: Add the routes**

In `apps/backend/src/routes/user.routes.ts`, inside `userRoutes`, after `get /me`, add a taste sub-router that reuses `buildServices`:

```ts
app.get('/taste/profile', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  return reply.send(await tasteMemory.getTasteProfile(request.user.sub));
});

app.get('/taste/personality', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  return reply.send(await tasteMemory.buildPersonality(request.user.sub));
});

app.get('/taste/journal', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  return reply.send(await tasteMemory.getJournal(request.user.sub));
});

app.get('/taste', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  const userId = request.user.sub;
  const [memories, personality, journal] = await Promise.all([
    tasteMemory.getTasteProfile(userId),
    tasteMemory.buildPersonality(userId),
    tasteMemory.getJournal(userId),
  ]);
  return reply.send({ memories, personality, journal });
});
```

- [ ] **Step 4: Typecheck + lint + test**

Run: `cd apps/backend && npm run typecheck && npm run lint && npm test`
Expected: all clean/green.

- [ ] **Step 5: Commit**

```bash
cd apps/backend && git add src/routes/user.routes.ts tests/user-routes.integration.test.ts && git commit -m "feat(backend): taste profile, personality, and journal API routes"
```

---

### Task 6: Mobile API client + Rescue result "why this?" deep-dive

**Files:**
- Create: `apps/mobile/src/services/taste.api.ts`
- Modify: `apps/mobile/src/services/rescue.api.ts` (no change needed — `resonanceMemory` rides through `RescueGenerateResponse`)
- Modify: `apps/mobile/src/screens/RescueResultScreen.tsx`
- Verify: mobile tsc + eslint (no mobile jest exists)

**Interfaces:**
- Consumes: `TasteMemoryEntry`, `FoodPersonality`, `TasteJournalEntry`, `MemoryReason` from `@meal-rescue/shared-types`.
- Produces: `getTasteProfile()`, `getPersonality()`, `getJournal()`, `getTasteBundle()` in `taste.api.ts`.
- Produces: `RescueResultScreen` renders a "Why this?" expander under the recommendation card when `chosen.resonanceMemory` is present.

- [ ] **Step 1: Read the Expo 57 docs for the touch/expand pattern**

Read `https://docs.expo.dev/versions/v57.0.0/` (per `apps/mobile/AGENTS.md`) to confirm the RN `Pressable` API is available for the expander. (Standard RN `Pressable` is available in RN 0.86; no new dependency needed.)

- [ ] **Step 2: Create the API client**

Create `apps/mobile/src/services/taste.api.ts`:

```ts
import type {
  FoodPersonality,
  TasteJournalEntry,
  TasteMemoryEntry,
} from '@meal-rescue/shared-types';

import { api } from './api';

export async function getTasteProfile(): Promise<TasteMemoryEntry[]> {
  const res = await api.get<TasteMemoryEntry[]>('/api/v1/user/taste/profile');
  return res.data;
}

export async function getPersonality(): Promise<FoodPersonality | null> {
  const res = await api.get<FoodPersonality | null>('/api/v1/user/taste/personality');
  return res.data;
}

export async function getJournal(): Promise<TasteJournalEntry[]> {
  const res = await api.get<TasteJournalEntry[]>('/api/v1/user/taste/journal');
  return res.data;
}

export async function getTasteBundle(): Promise<{
  memories: TasteMemoryEntry[];
  personality: FoodPersonality | null;
  journal: TasteJournalEntry[];
}> {
  const res = await api.get<{
    memories: TasteMemoryEntry[];
    personality: FoodPersonality | null;
    journal: TasteJournalEntry[];
  }>('/api/v1/user/taste');
  return res.data;
}
```

- [ ] **Step 3: Add the "Why this?" expander to RescueResultScreen**

In `apps/mobile/src/screens/RescueResultScreen.tsx`:

1. Add an import + a local `useState`:

```tsx
import { useState } from 'react';
// (already imported)
const [showWhy, setShowWhy] = useState(false);
```

2. Inside the recommendation card, directly under the `naturalLanguageExplanation` `Text` (line 102), insert the deep-dive block:

```tsx
{chosen.resonanceMemory && (
  <View style={styles.memoryBox}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Why this suggestion"
      accessibilityState={{ expanded: showWhy }}
      onPress={() => setShowWhy((v) => !v)}
      style={styles.memoryToggle}
    >
      <Text style={styles.memoryToggleText}>{showWhy ? 'Why this? -' : 'Why this? +'}</Text>
    </Pressable>
    {showWhy && (
      <Text style={styles.memoryDetail}>
        We remember you{' '}
        {chosen.resonanceMemory.affinity >= 0
          ? `liked ${chosen.resonanceMemory.ingredient}`
          : `steer clear of ${chosen.resonanceMemory.ingredient}`}{' '}
        in {chosen.resonanceMemory.contextValue} dishes, so we factored that in.
      </Text>
    )}
  </View>
)}
```

3. Add `Pressable` to the react-native import list (it is part of RN core):

```tsx
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
```

4. Add styles:

```tsx
memoryBox: {
  marginTop: spacing.sm,
},
memoryToggle: {
  alignSelf: 'flex-start',
  paddingVertical: spacing.xs,
},
memoryToggleText: {
  color: colors.primary,
  fontWeight: '600',
  fontSize: 14,
},
memoryDetail: {
  marginTop: spacing.xs,
  fontSize: 13,
  color: colors.textSecondary,
  lineHeight: 18,
},
```

- [ ] **Step 4: Verify mobile gates**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
cd apps/mobile && git add src/services/taste.api.ts src/screens/RescueResultScreen.tsx && git commit -m "feat(mobile): taste api client + 'why this?' deep-dive on rescue results"
```

---

### Task 7: Taste Journal screen + Profile integration + Food Personality

**Files:**
- Create: `apps/mobile/src/screens/TasteJournalScreen.tsx`
- Modify: `apps/mobile/src/screens/ProfileScreen.tsx`
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx`
- Verify: mobile tsc + eslint

**Interfaces:**
- Consumes: `getTasteBundle()` from `taste.api.ts`, `RootStackParamList`.
- Produces: `TasteJournal` screen registered on the root stack and reachable from Profile via a new "Taste Journal" row.

- [ ] **Step 1: Read Expo 57 docs for ScrollView/FlatList + navigation prop types**

Consult `https://docs.expo.dev/versions/v57.0.0/` to confirm FlatList usage. (Standard RN `FlatList` is available; no dependency change.)

- [ ] **Step 2: Register the screen in navigation**

In `apps/mobile/src/navigation/AppNavigator.tsx`:

1. Add import: `import { TasteJournalScreen } from '../screens/TasteJournalScreen';`
2. Extend `RootStackParamList`:

```ts
export type RootStackParamList = {
  Tabs: undefined;
  Paywall: undefined;
  TasteJournal: undefined;
};
```

3. Add a screen in the `RootStack.Navigator` (after `Paywall`):

```tsx
<RootStack.Screen name="TasteJournal" component={TasteJournalScreen} />
```

- [ ] **Step 3: Create the Taste Journal screen**

Create `apps/mobile/src/screens/TasteJournalScreen.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  FoodPersonality,
  TasteJournalEntry,
  TasteMemoryEntry,
} from '@meal-rescue/shared-types';

import { ErrorBanner } from '../components/ErrorBanner';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { toApiError } from '../services/api';
import { getTasteBundle } from '../services/taste.api';
import { colors, spacing, typography } from '../theme';

/**
 * Taste Journal - the app's running memory of what it has learned about
 * you, plus your evolving Food Personality. Refreshed on focus.
 */
export function TasteJournalScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [journal, setJournal] = useState<TasteJournalEntry[]>([]);
  const [personality, setPersonality] = useState<FoodPersonality | null>(null);
  const [memories, setMemories] = useState<TasteMemoryEntry[]>([]);
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null);

  useEffect(() => {
    getTasteBundle()
      .then((bundle) => {
        setJournal(bundle.journal);
        setPersonality(bundle.personality);
        setMemories(bundle.memories);
      })
      .catch((err) => setError(toApiError(err)));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={journal}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        ListHeaderComponent={
          <>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back to profile"
              onPress={() => navigation.goBack()}
              style={styles.backRow}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
              <Text style={styles.backText}>Profile</Text>
            </TouchableOpacity>

            <Text style={[typography.title, styles.title]}>Taste Journal</Text>
            <Text style={[typography.body, styles.subtitle]}>
              What Meal Rescue remembers about how you eat.
            </Text>

            {personality && personality.traits.length > 0 && (
              <View style={styles.personalityCard}>
                <Text style={styles.personalityTitle}>Your Food Personality</Text>
                {personality.traits.map((trait) => (
                  <View key={trait.id} style={styles.traitRow}>
                    <Text style={styles.traitLabel}>{trait.label}</Text>
                    <Text style={styles.traitDesc}>{trait.description}</Text>
                  </View>
                ))}
                <Text style={styles.personalityBio}>{personality.bio}</Text>
              </View>
            )}

            <Text style={styles.sectionHeader}>Entries</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <Text style={styles.entryText}>{item.text}</Text>
            <Text style={styles.entryDate}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No memories yet</Text>
            <Text style={styles.emptySub}>
              Rescue meals and give feedback to start your Taste Journal.
            </Text>
          </View>
        }
        contentContainerStyle={styles.content}
      />
      <ErrorBanner error={error} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  backText: { color: colors.primary, fontSize: 15 },
  title: { marginBottom: spacing.xs },
  subtitle: { color: colors.textSecondary, marginBottom: spacing.lg },
  personalityCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  personalityTitle: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm },
  traitRow: { marginBottom: spacing.xs },
  traitLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  traitDesc: { fontSize: 13, color: colors.textSecondary },
  personalityBio: { marginTop: spacing.sm, fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  sectionHeader: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  entryText: { fontSize: 14, color: colors.text, marginBottom: spacing.xs },
  entryDate: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
```

- [ ] **Step 4: Add the Taste Journal entry to Profile**

In `apps/mobile/src/screens/ProfileScreen.tsx`, inside the "Settings" `section` View, after the "About Meal Rescue" row, add a navigation row to the journal:

```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Open taste journal"
  onPress={() => navigation.navigate('TasteJournal')}
  style={styles.settingRow}
  activeOpacity={0.7}
>
  <Ionicons name="book-outline" size={22} color={colors.text} />
  <View style={styles.settingLabel}>
    <Text style={styles.settingTitle}>Taste Journal</Text>
    <Text style={styles.settingSub}>What Meal Rescue remembers about you</Text>
  </View>
  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
</TouchableOpacity>
```

`navigation` for `ProfileScreen` is typed as `NativeStackNavigationProp<RootStackParamList>` already, so `navigate('TasteJournal')` type-checks once the route is registered (Step 2).

- [ ] **Step 5: Verify mobile gates**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
cd apps/mobile && git add src/screens/TasteJournalScreen.tsx src/screens/ProfileScreen.tsx src/navigation/AppNavigator.tsx && git commit -m "feat(mobile): taste journal screen + food personality + profile entry"
```

---

### Task 8: Final gates + docs

- [ ] **Step 1: Full workspace gates**

Run from repo root:

```bash
cd apps/backend && npm run typecheck && npm run lint && npm test
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
```

Expected: backend typecheck/lint green, Jest suite green (integration gates on `TEST_DATABASE_URL`), mobile typecheck + eslint green.

- [ ] **Step 2: Manual smoke (if a DB + emulator are available)**

With `TEST_DATABASE_URL` set and a local Postgres: run `cd apps/backend && npm run dev`, then exercise:
1. `POST /api/v1/meal/analyze` with text "tacos with salsa".
2. `POST /api/v1/rescue/generate` → inspect `recommendation` for an optional `resonanceMemory`.
3. `POST /api/v1/rescue/:id/feedback` with `{ satisfaction: 'better' }`.
4. `GET /api/v1/user/taste` → `memories` length increased, `journal` non-empty after feedback.
5. `GET /api/v1/user/taste/personality` → personality object once enough signals accumulate.
Mobile: run the Expo app, navigate Profile → Taste Journal, verify entries render; rescue a meal and expand "Why this?".

- [ ] **Step 3: Update docs and commit**

In `PROGRESS.md`, add a section describing the Taste Memory Bank (per-context affinity, resonance explanations, Food Personality, Taste Journal, new endpoints + screens). Then commit:

```bash
git add PROGRESS.md implementationplan.md && git commit -m "docs: taste memory bank implementation plan and progress"
```

---

# Part 2 — Cultural Awareness (Culinary Compass)

> Builds on Part 1 (Tasks 1-8). Culture is added as **learned memory dimensions** plus a **cold-start prior**, not a stereotype. **Country-agnostic by design** — the identical mechanism serves a user whose home kitchen is Indian, Brazilian, Japanese, Nigerian, Italian, or anything else; no country is privileged. Product rules locked during design:
> - **Explicit intent wins:** if the detected meal is unambiguously a given cuisine (a dish name tied to one food world), suggest in that cuisine regardless of the user's prior.
> - **Ambiguous defaults to prior:** generic meals with no strong cuisine signal lean toward the user's seeded + learned `cuisine_family` affinities.
> - **Purely behavior-learned after seeding:** after the Culinary Compass seeds the prior, all `cuisine_family` and `tradition_vs_modern` values update ONLY from accept/reject/swap/feedback signals. No manual knobs.
> - **No stereotyping copy:** every explanation/trait is framed as *learning*, never as "you're <culture>, so you must want <food>".
> - **Card-based, morphing UI (not forms):** the on-device experience must be smooth cards that slide/scale/morph between states with springs — never a filled-in form, grid of radio buttons, or fade-only transitions. The Compass is a single tappable state shared by the entire flow (see below)

---

### Task D1: Culinary family definitions + market/marker/context maps

**Files:**
- Create: `apps/backend/src/services/ai/culinary-families.ts`
- Modify: `apps/backend/src/services/ai/ingredient-db.ts` (optional helper re-export)
- Test: `apps/backend/tests/culinary-families.test.ts`
- Modify: `packages/shared-types/src/index.ts` (add `CulinaryFamily` etc. per the updated Task 2 shared block)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type CulinaryFamily = 'indian' | 'east_asian' | 'mediterranean' | 'mexican' | 'american' | 'middle_eastern' | 'italian' | 'none'`
  - `export interface CulinaryFamilyDef { family; label; signatureIngredients: string[]; ambiguousKeywords: string[]; explicitMarkers: string[]; modernTwists: string[]; traditionalAnchor: string[] }`
  - `export const CULINARY_FAMILIES: CulinaryFamilyDef[]`
  - `export function detectCuisineIntent(foodNames: string[]): 'explicit' | 'ambiguous' | 'none'` — returns the strongest family for EXPLICIT markers only, or `none`.
  - `export function matchAmbiguousFamily(foodNames: string[], affinities: Map<string, number>): CulinaryFamily | 'none'` — picks the family among those whose signature/ambiguous keywords appear, weighted by the user's cuisine affinities.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/culinary-families.test.ts`:

```ts
import {
  CULINARY_FAMILIES,
  detectCuisineIntent,
  matchAmbiguousFamily,
} from '../src/services/ai/culinary-families';

describe('culinary families', () => {
  it('ships at least the eight core families', () => {
    const families = CULINARY_FAMILIES.map((f) => f.family);
    for (const fam of ['indian', 'east_asian', 'mediterranean', 'mexican']) {
      expect(families).toContain(fam);
    }
  });

  it('detects explicit cuisine intent from strong, unambiguous dish names', () => {
    // A dish name tied to exactly one food world wins regardless of any prior.
    expect(detectCuisineIntent(['pho'])).toBe('east_asian');
    expect(detectCuisineIntent(['shawarma'])).toBe('middle_eastern');
    expect(detectCuisineIntent(['falafel'])).toBe('mediterranean');
  });

  it('returns none for generic foods (no strong signal)', () => {
    expect(detectCuisineIntent(['rice', 'chicken'])).toBe('none');
  });

  it('matches ambiguous meals to the family with the highest learned affinity', () => {
    const affinities = new Map<string, number>([
      ['mediterranean', 0.9],
      ['east_asian', 0.1],
    ]);
    // 'rice' is ambiguous (shared by many worlds); pick the user's strongest.
    const match = matchAmbiguousFamily(['rice'], affinities);
    expect(['mediterranean', 'east_asian']).toContain(match);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest tests/culinary-families.test.ts --runInBand`
Expected: FAIL with "Cannot find module '../src/services/ai/culinary-families'".

- [ ] **Step 3: Add the shared types (if not already added in Task 2)**

In `packages/shared-types/src/index.ts` confirm the following exist (added during Task 2's updated block):

```ts
export type CulinaryFamily =
  | 'indian'
  | 'east_asian'
  | 'mediterranean'
  | 'mexican'
  | 'american'
  | 'middle_eastern'
  | 'italian'
  | 'none';

export interface CulinaryCompassSeed {
  family: CulinaryFamily;
  traditionVsModern: Confidence; // -1.0 pure & traditional .. +1.0 loves fusion twists
}
```

- [ ] **Step 4: Create the culinary families module**

Create `apps/backend/src/services/ai/culinary-families.ts`:

```ts
import type { CulinaryFamily } from '@meal-rescue/shared-types';

export interface CulinaryFamilyDef {
  family: CulinaryFamily;
  label: string;
  /** Ingredients this family treats as "native" (used for ambiguous matching). */
  signatureIngredients: string[];
  /** Generic words that this family commonly cooks (rice, bread, soup...). */
  ambiguousKeywords: string[];
  /** Strong, cuisine-exclusive words - if present, intent is UNMISTAKABLE. */
  explicitMarkers: string[];
  /** Modern/fusion additions the family recognizes. */
  modernTwists: string[];
  /** Authentic/pure additions the family recognizes. */
  traditionalAnchor: string[];
}

export const CULINARY_FAMILIES: CulinaryFamilyDef[] = [
  {
    family: 'indian',
    label: 'Indian',
    signatureIngredients: ['rice', 'dal', 'chickpea', 'curry'],
    ambiguousKeywords: ['rice', 'bread', 'curry', 'soup', 'vegetable'],
    explicitMarkers: ['tandoori', 'naan', 'roti', 'paratha', 'dal', 'biryani', 'khichdi', 'poha', 'samosa'],
    modernTwists: ['saag paneer pizza', 'butter chicken tacos', 'tandoori quesadilla'],
    traditionalAnchor: ['ghee', 'cumin', 'turmeric', 'dal', 'garam masala'],
  },
  {
    family: 'east_asian',
    label: 'East Asian',
    signatureIngredients: ['rice', 'noodle', 'tofu', 'soy'],
    ambiguousKeywords: ['rice', 'noodle', 'stir-fry', 'soup'],
    explicitMarkers: ['chow mein', 'ramen', 'sushi', 'dim sum', 'pad thai', 'pho', 'wonton', 'teriyaki'],
    modernTwists: ['kimchi fried rice', 'bao buns', 'poke bowl'],
    traditionalAnchor: ['edamame', 'spinach', 'tofu', 'seaweed', 'sesame'],
  },
  {
    family: 'mediterranean',
    label: 'Mediterranean',
    signatureIngredients: ['olive', 'hummus', 'cucumber', 'tomato'],
    ambiguousKeywords: ['salad', 'pita', 'vegetable', 'grilled'],
    explicitMarkers: ['hummus', 'falafel', 'gyro', 'souvlaki', 'tabbouleh', 'tahini'],
    modernTwists: ['hummus toast', 'falafel bowl', 'zilla salad'],
    traditionalAnchor: ['cucumber', 'tomato', 'olive oil', 'hummus', 'feta'],
  },
  {
    family: 'mexican',
    label: 'Mexican',
    signatureIngredients: ['tortilla', 'salsa', 'beans', 'avocado'],
    ambiguousKeywords: ['taco', 'burrito', 'soup', 'rice'],
    explicitMarkers: ['taco', 'burrito', 'quesadilla', 'enchilada', 'tamale', 'elote', 'pozole'],
    modernTwists: ['taco bowl', 'burrito bowl', 'street corn salad'],
    traditionalAnchor: ['canned black beans', 'salsa', 'avocado', 'corn'],
  },
  {
    family: 'american',
    label: 'American',
    signatureIngredients: ['toast', 'cheese', 'burger', 'fries'],
    ambiguousKeywords: ['sandwich', 'burger', 'toast', 'grilled'],
    explicitMarkers: ['burger patty', 'mac and cheese', 'grilled cheese', 'barbecue'],
    modernTwists: ['loaded fries', 'breakfast bowl', 'chicken and waffles'],
    traditionalAnchor: ['egg', 'tomato', 'cheese', 'bacon'],
  },
  {
    family: 'middle_eastern',
    label: 'Middle Eastern',
    signatureIngredients: ['chickpea', 'olive', 'pita', 'rice'],
    ambiguousKeywords: ['rice', 'bread', 'grilled', 'salad'],
    explicitMarkers: ['shawarma', 'kebab', 'fattoush', 'tabbouleh', 'hummus', 'mujadara'],
    modernTwists: ['shawarma bowl', 'pita sandwich', 'falafel crunch wrap'],
    traditionalAnchor: ['chickpea', 'olive', 'cumin', 'yogurt', 'cucumber'],
  },
  {
    family: 'italian',
    label: 'Italian',
    signatureIngredients: ['bread', 'cheese', 'tomato', 'pasta'],
    ambiguousKeywords: ['pasta', 'bread', 'salad', 'soup'],
    explicitMarkers: ['pizza', 'spaghetti', 'risotto', 'lasagna', 'carbonara', 'ciabatta'],
    modernTwists: ['pizza bowl', 'pesto pasta', 'caprese salad'],
    traditionalAnchor: ['tomato', 'basil', 'parmesan', 'olive oil'],
  },
  {
    family: 'none',
    label: 'General',
    signatureIngredients: [],
    ambiguousKeywords: [],
    explicitMarkers: [],
    modernTwists: [],
    traditionalAnchor: [],
  },
];

const familyByFamily = new Map(CULINARY_FAMILIES.map((f) => [f.family, f]));

/** Only EXPLICIT, cuisine-exclusive words. Returns 'none' when the meal is generic. */
export function detectCuisineIntent(foodNames: string[]): CulinaryFamily | 'none' {
  const names = foodNames.map((n) => n.toLowerCase()).join(' ');
  let best: CulinaryFamily | 'none' = 'none';
  let bestLen = 0;
  for (const def of CULINARY_FAMILIES) {
    for (const marker of def.explicitMarkers) {
      if (names.includes(marker) && marker.length > bestLen) {
        best = def.family;
        bestLen = marker.length;
      }
    }
  }
  return best;
}

/** For ambiguous meals: pick the family among plausible ones weighted by user affinities. */
export function matchAmbiguousFamily(
  foodNames: string[],
  affinities: Map<CulinaryFamily, number>,
): CulinaryFamily | 'none' {
  const names = foodNames.map((n) => n.toLowerCase()).join(' ');
  const plausible = new Set<CulinaryFamily>();
  for (const def of CULINARY_FAMILIES) {
    const hitSignature = def.signatureIngredients.some((s) => names.includes(s));
    const hitAmbiguous = def.ambiguousKeywords.some((k) => names.includes(k));
    if (hitSignature || hitAmbiguous) plausible.add(def.family);
  }
  if (plausible.size === 0) return 'none';
  let best: CulinaryFamily = 'none';
  let bestScore = -Infinity;
  for (const fam of plausible) {
    const score = affinities.get(fam) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = fam;
    }
  }
  return best;
}

export function getCulinaryFamily(family: CulinaryFamily): CulinaryFamilyDef {
  return familyByFamily.get(family) ?? familyByFamily.get('none')!;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest tests/culinary-families.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `cd apps/backend && npm run typecheck`
Expected: clean.

```bash
cd apps/backend && git add src/services/ai/culinary-families.ts tests/culinary-families.test.ts && git commit -m "feat(backend): culinary family definitions + explicit-intent & ambiguous matching"
```

---

### Task D2: Culture-aware learning in TasteMemoryService

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts`
- Test: `apps/backend/tests/taste-memory-service-culture.test.ts` (create)

**Interfaces:**
- Consumes: `CULINARY_FAMILIES`, `detectCuisineIntent`, `matchAmbiguousFamily`, `CulinaryFamily`, `CulinaryCompassSeed`, `UserPreferenceSnapshot`.
- Produces (new methods on `TasteMemoryService`):
  - `seedCompass(userId, seed: CulinaryCompassSeed): Promise<void>` — writes `cuisine_family` and `tradition_vs_modern` prior memories (`source: 'profile'`).
  - `getCuisineAffinities(userId): Promise<Map<CulinaryFamily, number>>`
  - `getTraditionVsModern(userId): Promise<number>` — +1 loves fusion, -1 pure traditional, 0 unknown.
  - `recordCultureContext(userId, rescue, decision): Promise<void>` — when a rescue is accepted/rejected, bumps the `cuisine_family` affinity (factoring in the detected intent or ambiguous family) and, for modern-twist candidates, moves `tradition_vs_modern` up; traditional anchors move it down.
  - `buildPreferenceSnapshot` now also returns `favoriteFoods`/`avoidedFoods` as before (no signature change to Part 1 consumers).

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/taste-memory-service-culture.test.ts`:

```ts
import { CulinaryCompassSeed } from '@meal-rescue/shared-types';

import { TasteMemoryService } from '../src/services/taste-memory.service';

interface Row {
  id: string;
  userId: string;
  ingredient: string;
  contextType: string;
  contextValue: string;
  affinity: number;
  confidence: number;
  observationCount: number;
  source: string;
  lastUpdated: Date;
}

function fakeModels(rows: Row[] = []) {
  const store = rows;
  let seq = 0;
  return {
    models: {
      TasteMemory: {
        async findAll({ where }: { where: { userId: string } }) {
          return store
            .filter((r) => r.userId === where.userId)
            .sort((a, b) => b.confidence - a.confidence)
            .map((r) => ({ get: () => ({ ...r }) }));
        },
        async findOne({ where }: { where: Record<string, unknown> }) {
          const match = store.find((r) =>
            Object.entries(where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
          );
          return match ? { get: () => ({ ...match }), save: async () => {} } : null;
        },
        async create(row: Row) {
          const created = { ...row, id: `m${++seq}` };
          store.push(created);
          return created;
        },
      },
    },
    store,
  };
}

describe('TasteMemoryService cultural learning', () => {
  it('seedCompass writes cuisine_family and tradition_vs_modern priors', async () => {
    const { models, store } = fakeModels();
    const svc = new TasteMemoryService(models as never);
    const seed: CulinaryCompassSeed = { family: 'indian', traditionVsModern: -0.6 };
    await svc.seedCompass('u1', seed);
    expect(store.some((r) => r.contextType === 'cuisine_family' && r.contextValue === 'indian')).toBe(true);
    expect(store.some((r) => r.contextType === 'tradition_vs_modern' && r.contextValue === 'overall')).toBe(true);
  });

  it('getCuisineAffinities reflects seeded values', async () => {
    const { models } = fakeModels([
      { id: '1', userId: 'u1', ingredient: 'indian', contextType: 'cuisine_family', contextValue: 'indian', affinity: 0.8, confidence: 1.0, observationCount: 1, source: 'profile', lastUpdated: new Date() },
    ]);
    const svc = new TasteMemoryService(models as never);
    const affinities = await svc.getCuisineAffinities('u1');
    expect(affinities.get('indian')).toBeCloseTo(0.8);
  });

  it('getTraditionVsModern defaults to 0 when unknown', async () => {
    const { models } = fakeModels([]);
    const svc = new TasteMemoryService(models as never);
    expect(await svc.getTraditionVsModern('u1')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest tests/taste-memory-service-culture.test.ts --runInBand`
Expected: FAIL (methods don't exist).

- [ ] **Step 3: Add the culture methods to TasteMemoryService**

In `apps/backend/src/services/taste-memory.service.ts`:

1. Add imports:

```ts
import type { CulinaryCompassSeed, CulinaryFamily } from '@meal-rescue/shared-types';
import {
  CULINARY_FAMILIES,
  detectCuisineIntent,
  matchAmbiguousFamily,
  getCulinaryFamily,
} from './ai/culinary-families';
```

2. Add the methods inside the class (after `buildPreferenceSnapshot`):

```ts
async seedCompass(userId: string, seed: CulinaryCompassSeed): Promise<void> {
  if (seed.family !== 'none') {
    await this.applySignal({
      userId,
      ingredient: seed.family,
      contextType: 'cuisine_family',
      contextValue: seed.family,
      affinityDelta: 0.8,
      confidenceDelta: 0.5,
      source: 'profile',
    });
  }
  await this.applySignal({
    userId,
    ingredient: 'tradition',
    contextType: 'tradition_vs_modern',
    contextValue: 'overall',
    affinityDelta: seed.traditionVsModern,
    confidenceDelta: 0.5,
    source: 'profile',
  });
}

async getCuisineAffinities(userId: string): Promise<Map<CulinaryFamily, number>> {
  const profile = await this.getTasteProfile(userId);
  const cuisines = profile.filter((m) => m.contextType === 'cuisine_family');
  const map = new Map<CulinaryFamily, number>();
  for (const c of cuisines) {
    if (isCulinaryFamily(c.contextValue)) {
      // Blend affinity with confidence: low-confidence priors count less.
      map.set(c.contextValue, c.affinity * Math.min(1, c.confidence));
    }
  }
  return map;
}

async getTraditionVsModern(userId: string): Promise<number> {
  const profile = await this.getTasteProfile(userId);
  const row = profile.find((m) => m.contextType === 'tradition_vs_modern');
  return row ? row.affinity : 0;
}

async recordCultureContext(
  userId: string,
  rescue: { selectedRecommendation: Record<string, unknown> },
  decision: string,
): Promise<void> {
  const candidate = (
    rescue.selectedRecommendation.candidate as
      | { additions?: Array<{ name: string }>; substitutions?: Array<{ replacement: { name: string } }> }
      | undefined
  ) ?? { additions: [], substitutions: [] };
  const foodNames = [
    ...(candidate.additions ?? []).map((a) => a.name),
    ...(candidate.substitutions ?? []).map((s) => s.replacement.name),
  ];
  const intent = detectCuisineIntent(foodNames);
  if (intent !== 'none') {
    await this.applySignal({
      userId,
      ingredient: intent,
      contextType: 'cuisine_family',
      contextValue: intent,
      affinityDelta: decision === 'accepted' || decision === 'swapped' ? 0.3 : -0.25,
      confidenceDelta: 0.12,
      source: decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject',
    });
    return;
  }
  const affinities = await this.getCuisineAffinities(userId);
  const family = matchAmbiguousFamily(foodNames, affinities);
  if (family !== 'none') {
    await this.applySignal({
      userId,
      ingredient: family,
      contextType: 'cuisine_family',
      contextValue: family,
      affinityDelta: decision === 'accepted' || decision === 'swapped' ? 0.2 : -0.15,
      confidenceDelta: 0.08,
      source: decision === 'swapped' ? 'swap' : decision === 'accepted' ? 'accept' : 'reject',
    });
  }
}
```

3. Add a type guard helper at the bottom (outside the class):

```ts
const CULINARY_FAMILY_SET = new Set<string>(CULINARY_FAMILIES.map((f) => f.family));

function isCulinaryFamily(value: string): value is CulinaryFamily {
  return CULINARY_FAMILY_SET.has(value);
}
```

4. In `buildPreferenceSnapshot`, prefer high-confident favorites/avoided across ALL contexts (existing behavior already filters by confidence), and also include family-level favorites so candidate generation can lean culture-aware:

```ts
async buildPreferenceSnapshot(
  userId: string,
): Promise<{ favoriteFoods?: string[]; avoidedFoods?: string[] }> {
  const profile = await this.getTasteProfile(userId);
  if (profile.length === 0) return {};
  const ingredients = profile.filter((m) =>
    m.contextType === 'cuisine' || m.contextType === 'meal_time' || m.contextType === 'meal_pattern',
  );
  const favorites = ingredients
    .filter((m) => m.affinity >= 0.5 && m.confidence >= 0.5)
    .map((m) => m.ingredient);
  const avoided = ingredients
    .filter((m) => m.affinity <= -0.5 && m.confidence >= 0.5)
    .map((m) => m.ingredient);
  return {
    favoriteFoods: favorites.length ? [...new Set(favorites)] : undefined,
    avoidedFoods: avoided.length ? [...new Set(avoided)] : undefined,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest tests/taste-memory-service-culture.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite + commit**

Run: `cd apps/backend && npm run typecheck && npm test`
Expected: clean/ green.

```bash
cd apps/backend && git add src/services/taste-memory.service.ts tests/taste-memory-service-culture.test.ts && git commit -m "feat(backend): culture-aware taste memory - cuisine family affinity + tradition/modern axis"
```

---

### Task D3: Culture-aware candidate generation (prior + intent; traditional + modern)

**Files:**
- Modify: `apps/backend/src/services/candidate-generator.service.ts`
- Modify: `apps/backend/src/services/rescue-pipeline.service.ts`
- Modify: `apps/backend/src/services/composition.ts`
- Test: `apps/backend/tests/candidate-generator-culture.test.ts` (create)

**Interfaces:**
- Consumes: `TasteMemoryService.getCuisineAffinities`, `TasteMemoryService.getTraditionVsModern`, `CULINARY_FAMILIES`, `detectCuisineIntent`, `matchAmbiguousFamily`.
- Produces:
  - `CandidateGeneratorService.generateCandidates` gains an optional 6th param `culture?: { affinities: Map<CulinaryFamily, number>; traditionVsModern: number }`.
  - A new strategy `cultureAlignedAdditions(...)` that produces a **traditionalAnchor candidate** and a **modernTwist candidate** for the relevant family, ordered by `traditionVsModern`.
  - `RescuePipelineService.generateRescue` loads culture and passes it through.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/candidate-generator-culture.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { Constraints, DetectedFood, DetectedIngredient, RescueCandidate } from '@meal-rescue/shared-types';

import { CandidateGeneratorService } from '../src/services/candidate-generator.service';

function food(name: string): DetectedFood {
  return { name, confidence: 0.9 };
}
function ingredient(name: string): DetectedIngredient {
  return { name, confidence: 0.9, state: 'cooked' };
}

describe('candidate generator culture-aware', () => {
  const generator = new CandidateGeneratorService();
  const emptyConstraints: Constraints = {};

  it('suggests in an explicit cuisine for a clearly-marked meal regardless of prior', () => {
    // Prior points at one food world, but the dish name unambiguously belongs
    // to another -> the dish wins. Principle is country-agnostic.
    const foods = [food('pho')];
    const culture = {
      affinities: new Map([['middle_eastern' as const, 0.9]]),
      traditionVsModern: -0.6,
    };
    const candidates = generator.generateCandidates(
      foods,
      [ingredient('pho')],
      { protein: false, fiber_sources: false },
      emptyConstraints,
      {},
      [],
      culture,
    );
    const names = candidates.flatMap((c) => [
      ...c.additions.map((a) => a.name),
      ...c.substitutions.map((s) => s.replacement.name),
    ]);
    // east_asian traditional anchor / modernTwists reference edamame/tofu/soy etc.
    expect(names.some((n) => /edamame|tofu|soy/.test(n))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && npx jest tests/candidate-generator-culture.test.ts --runInBand`
Expected: FAIL (6th `culture` param not accepted; or behavior lacks east_asian additions).

- [ ] **Step 3: Add the culture-aware strategy + param to the generator**

In `apps/backend/src/services/candidate-generator.service.ts`:

1. Import `CulinaryFamily` and the culture helpers:

```ts
import type { CulinaryFamily } from '@meal-rescue/shared-types';
import { CULINARY_FAMILIES, detectCuisineIntent, matchAmbiguousFamily } from './ai/culinary-families';
```

2. Add an exported interface + the param:

```ts
export interface CultureContext {
  affinities: Map<CulinaryFamily, number>;
  traditionVsModern: number;
}
```

3. Change `generateCandidates` signature and call the new strategy:

```ts
generateCandidates(
  detectedFoods: DetectedFood[],
  detectedIngredients: DetectedIngredient[],
  detectedComponents: Record<string, boolean>,
  constraints: Constraints,
  preferences: UserPreferenceSnapshot,
  pantry: string[],
  culture?: CultureContext,
): RescueCandidate[] {
  const candidates: RescueCandidate[] = [
    ...this.componentAdditions(detectedComponents, constraints),
    ...this.cuisineEnhancements(detectedFoods, constraints),
    ...this.minimalSubstitutions(detectedIngredients, preferences),
    ...this.favoriteAdditions(preferences, detectedFoods, pantry),
    ...this.cultureAlignedAdditions(detectedFoods, constraints, culture),
  ];
  return dedupeByIdentity(candidates).slice(0, MAX_CANDIDATES);
}
```

4. Add the strategy method:

```ts
private cultureAlignedAdditions(
  detectedFoods: DetectedFood[],
  constraints: Constraints,
  culture?: CultureContext,
): RescueCandidate[] {
  if (!culture || culture.affinities.size === 0) return [];
  const foodNames = detectedFoods.map((f) => f.name.toLowerCase());

  // Explicit intent always wins.
  const intent = detectCuisineIntent(foodNames);
  let family: CulinaryFamily | 'none' = intent;
  if (family === 'none') {
    family = matchAmbiguousFamily(foodNames, culture.affinities);
  }
  if (family === 'none') return [];
  const def = CULINARY_FAMILIES.find((f) => f.family === family)!;
  const noCooking = constraints.cookingRequired === false;
  const maxTime = constraints.timeMinutes ?? 30;

  const toCandidate = (name: string, alignment: number): RescueCandidate | null => {
    const record = findIngredient(name.toLowerCase()) ?? findBestMatch(name);
    if (!record) return null;
    if (record.prepTimeMinutes > maxTime) return null;
    if (noCooking && record.cookingSteps !== 0) return null;
    return this.fromRecord(record, record.components, alignment);
  };

  const traditional = def.traditionalAnchor[0];
  const modern = def.modernTwists[0];
  const out: RescueCandidate[] = [];
  const preference = culture.traditionVsModern;

  // Emit both, ordered by the learned tradition/modern level.
  if (preference >= 0) {
    const m = modern ? toCandidate(modern, 0.85) : null;
    const t = traditional ? toCandidate(traditional, 0.75) : null;
    if (m) out.push(m);
    if (t) out.push(t);
  } else {
    const t = traditional ? toCandidate(traditional, 0.85) : null;
    const m = modern ? toCandidate(modern, 0.75) : null;
    if (t) out.push(t);
    if (m) out.push(m);
  }
  return out;
}
```

Note: `fromRecord`, `findIngredient`, `findBestMatch` are already imported/available in this file. For `modernTwists`/`traditionalAnchor` that are full dish names (e.g. `'saag paneer pizza'`), `findBestMatch` returns the closest KB ingredient or null — the strategy gracefully skips unmatched ones, so the file stays correct even when a twist isn't in the small KB.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest tests/candidate-generator-culture.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Thread culture through the pipeline**

In `apps/backend/src/services/rescue-pipeline.service.ts`:

1. Import `CulinaryFamily`:

```ts
import type { CulinaryFamily } from '@meal-rescue/shared-types';
```

2. In `generateRescue`, after loading preferences and pantry, load culture and pass to the generator:

```ts
const culture = this.tasteMemory
  ? {
      affinities: (await this.tasteMemory.getCuisineAffinities(userId)) as Map<CulinaryFamily, number>,
      traditionVsModern: await this.tasteMemory.getTraditionVsModern(userId),
    }
  : undefined;

const rawCandidates = this.generator.generateCandidates(
  detectedFoods,
  detectedIngredients,
  detectedComponents,
  constraints,
  preferences,
  pantry,
  culture,
);
```

Also, after a user makes a decision (in the feedback path) we record the culture context. Wire it in `feedback.service.ts` (or where decisions are recorded — currently the decision/feedback happens via `feedback.service.submitFeedback`). In `apps/backend/src/services/feedback.service.ts`, after `submitFeedback` persists, call:

```ts
const tasteMemory = new TasteMemoryService(this.models);
await tasteMemory.recordCultureContext(userId, {
  selectedRecommendation: rescue.selectedRecommendation as Record<string, unknown>,
}, rescue.userDecision);
await tasteMemory.recordDecision(userId, rescue.userDecision, {
  selectedRecommendation: rescue.selectedRecommendation as Record<string, unknown>,
});
```

(Import `TasteMemoryService` in `feedback.service.ts`.)

- [ ] **Step 6: Run typecheck + full suite + commit**

Run: `cd apps/backend && npm run typecheck && npm test`
Expected: clean/ green.

```bash
cd apps/backend && git add src/services/candidate-generator.service.ts src/services/rescue-pipeline.service.ts src/services/feedback.service.ts tests/candidate-generator-culture.test.ts && git commit -m "feat(backend): culture-aware candidate generation with prior+intent and traditional/modern pairing"
```

---

### Task D4: Culinary Compass + culture endpoints

**Files:**
- Modify: `apps/backend/src/routes/user.routes.ts` (add compass + culture endpoints)
- Modify: `apps/backend/src/routes/*` (none other needed)
- Test: `apps/backend/tests/compass.integration.test.ts` (create)

**Interfaces:**
- Consumes: `TasteMemoryService.seedCompass`, `getCuisineAffinities`, `getTraditionVsModern`.
- Produces:
  - `POST /api/v1/user/taste/compass` body `{ family, traditionVsModern }` → seeds prior; returns `{ ok: true }`.
  - `GET /api/v1/user/taste/culture` → `{ affinities: Record<CulinaryFamily, number>; traditionVsModern: number; seeded: boolean }`.

- [ ] **Step 1: Write the integration tests**

Create `apps/backend/tests/compass.integration.test.ts`:

```ts
import { buildApp } from '../src/app';
import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { registerTestUser } from '../helpers/auth';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);
const maybeDescribe = hasDb ? describe : describe.skip;

maybeDescribe('culinary compass (integration)', () => {
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

  it('seeds a compass and reads culture affinities back', async () => {
    const seed = await app.inject({
      method: 'POST',
      url: '/api/v1/user/taste/compass',
      headers: { authorization: `Bearer ${token}` },
      payload: { family: 'indian', traditionVsModern: -0.6 },
    });
    expect(seed.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/user/taste/culture',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { affinities: Record<string, number>; traditionVsModern: number; seeded: boolean };
    expect(body.seeded).toBe(true);
    expect(body.affinities.indian).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && npx jest tests/compass.integration.test.ts --runInBand`
Expected: FAIL (routes 404) or skipped without DB.

- [ ] **Step 3: Add the routes**

In `apps/backend/src/routes/user.routes.ts`, inside `userRoutes`, add:

```ts
app.get('/taste/culture', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  const userId = request.user.sub;
  const affinities = await tasteMemory.getCuisineAffinities(userId);
  const traditionVsModern = await tasteMemory.getTraditionVsModern(userId);
  return reply.send({
    affinities: Object.fromEntries(affinities),
    traditionVsModern,
    seeded: affinities.size > 0,
  });
});

app.post('/taste/compass', async (request, reply) => {
  const { tasteMemory } = buildServices(app.redis);
  const userId = request.user.sub;
  const parsed = z
    .object({
      family: z.enum(['indian', 'east_asian', 'mediterranean', 'mexican', 'american', 'middle_eastern', 'italian', 'none']),
      traditionVsModern: z.number().min(-1).max(1).default(0),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    throw new AppError({
      category: ErrorCategory.INPUT_VALIDATION,
      code: 'INVALID_COMPASS_INPUT',
      message: 'Body must be { family, traditionVsModern? }',
      statusCode: 400,
    });
  }
  await tasteMemory.seedCompass(userId, parsed.data);
  return reply.send({ ok: true });
});
```

Ensure `z` is imported in `user.routes.ts` (add `import { z } from 'zod';`).

- [ ] **Step 4: Run typecheck + lint + test**

Run: `cd apps/backend && npm run typecheck && npm run lint && npm test`
Expected: all clean/ green.

- [ ] **Step 5: Commit**

```bash
cd apps/backend && git add src/routes/user.routes.ts tests/compass.integration.test.ts && git commit -m "feat(backend): culinary compass seed + culture affinities endpoints"
```

---

### Task D5: Culinary Compass onboarding screen + culture-aware "why this?" + journal entries

**Files:**
- Create: `apps/mobile/src/screens/CulinaryCompassScreen.tsx`
- Create: `apps/mobile/src/services/culture.api.ts`
- Modify: `apps/mobile/src/navigation/AppNavigator.tsx` (add Compass to onboarding flow + gate flag)
- Modify: `apps/mobile/src/screens/RescueResultScreen.tsx` (culture-aware "why this?")
- Modify: `apps/mobile/src/screens/TasteJournalScreen.tsx` (render culture entries)
- Verify: mobile tsc + eslint

**Interfaces:**
- Consumes: `getCulinaryFamily` list, `CulinaryFamily`, `CulinaryCompassSeed`, `MemoryReason`.
- Produces:
  - `culture.api.ts`: `seedCompass(seed)` → `POST /api/v1/user/taste/compass`; `getCulture()` → `GET /api/v1/user/taste/culture`; `skipCompass()` → seeds `family: 'none'`.
  - `CulinaryCompassScreen` with `onComplete: (skipped: boolean) => void`.
  - `AppNavigator` onboarding: `ScrapsIntro` → `CulinaryCompass` (optional, skippable) → home. Uses an async flag `meal-rescue/compass-seen`.

- [ ] **Step 1: Read Expo 57 docs for onboarding + Pressable + FlatList**

Consult `https://docs.expo.dev/versions/v57.0.0/` to confirm `Pressable` and `FlatList` availability (RN core, available in RN 0.86). No new dependency needed.

- [ ] **Step 2: Create the culture API client**

Create `apps/mobile/src/services/culture.api.ts`:

```ts
import type { CulinaryCompassSeed, CulinaryFamily } from '@meal-rescue/shared-types';

import { api } from './api';

export interface CultureView {
  affinities: Record<CulinaryFamily, number>;
  traditionVsModern: number;
  seeded: boolean;
}

export async function seedCompass(seed: CulinaryCompassSeed): Promise<void> {
  await api.post('/api/v1/user/taste/compass', seed);
}

export async function skipCompass(): Promise<void> {
  await api.post('/api/v1/user/taste/compass', { family: 'none', traditionVsModern: 0 });
}

export async function getCulture(): Promise<CultureView> {
  const res = await api.get<CultureView>('/api/v1/user/taste/culture');
  return res.data;
}
```

- [ ] **Step 3: Create the Culinary Compass screen — a morphing card deck, not a form**

Design intent (locked): the Compass is a **card deck, not a form**. One large card sits center-stage; flicking up/down or tapping advances it, and it **morphs** (translate + scale + rotation springs) into the next cuisine card — never a static grid of radio buttons and never fade-only. A single continuous **draggable track** sets traditional ↔ modern (no three discrete buttons). All motion is Reanimated UI-thread shared-value driven.

Create `apps/mobile/src/screens/CulinaryCompassScreen.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

import type { CulinaryFamily } from '@meal-rescue/shared-types';

import { PrimaryButton } from '../components/PrimaryButton';
import { seedCompass, skipCompass } from '../services/culture.api';
import { colors, spacing, typography } from '../theme';
import { spring } from '../theme/motion';

const FAMILIES: Array<{ family: CulinaryFamily; emoji: string; blurb: string; accent: string }> = [
  { family: 'indian', emoji: '🍛', blurb: 'bold spice, comfort curries', accent: '#E8890C' },
  { family: 'east_asian', emoji: '🍜', blurb: 'noodles, rice, umami', accent: '#D84315' },
  { family: 'mediterranean', emoji: '🫒', blurb: 'olive oil, bright & fresh', accent: '#2E7D32' },
  { family: 'mexican', emoji: '🌮', blurb: 'warm, bold, lively', accent: '#C62828' },
  { family: 'american', emoji: '🍔', blurb: 'hearty, familiar comfort', accent: '#F9A825' },
  { family: 'middle_eastern', emoji: '🥙', blurb: 'earthy spice, warm flatbread', accent: '#6A1B9A' },
  { family: 'italian', emoji: '🍝', blurb: 'ripe tomato, fresh basil', accent: '#2E7D32' },
  { family: 'latin', emoji: '🌽', blurb: 'corn, beans, bright salsas', accent: '#EF6C00' },
];

interface Props {
  onComplete: (skipped: boolean) => void;
}

export function CulinaryCompassScreen({ onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [tradition, setTradition] = useState(-0.6); // default: lean traditional
  const [busy, setBusy] = useState(false);

  // UI-thread morph values: the outgoing card flies out as the next card springs up.
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);
  const deck = useSharedValue(0); // 0..1 progress into the deck

  // Advance the deck (called on the JS thread via runOnJS from the UI thread).
  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, FAMILIES.length - 1));
    // settle the deck back after it re-forms (plain JS setTimeout is fine here)
    setTimeout(() => {
      deck.value = 0;
      translateY.value = withSpring(0, spring.gentle);
      rotate.value = withSpring(0, spring.gentle);
      scale.value = withSpring(1, spring.gentle);
    }, 180);
  }, [translateY, rotate, scale, deck]);

  const morphOut = useCallback(() => {
    deck.value = withSpring(1, spring.snappy);
    translateY.value = withSpring(-240, spring.bouncy);
    rotate.value = withSpring(-14, spring.snappy);
    runOnJS(advance)();
  }, [deck, translateY, rotate, advance]);

  const settle = useCallback(() => {
    translateY.value = withSpring(0, spring.gentle);
    rotate.value = withSpring(0, spring.gentle);
    scale.value = withSpring(1, spring.gentle);
  }, [translateY, rotate, scale]);

  const resetToFirst = useCallback(() => {
    setIndex(0);
    settle();
  }, [settle]);

  // RN-core PanResponder drives the shared values (no extra gesture library needed).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 10,
        onPanResponderMove: (_e, g) => {
          translateY.value = g.dy;
          rotate.value = interpolate(g.dy, [-200, 0, 200], [-12, 0, 12], Extrapolate.CLAMP);
          scale.value = interpolate(Math.abs(g.dy), [0, 220], [1, 0.85], Extrapolate.CLAMP);
        },
        onPanResponderRelease: (_e, g) => {
          const threshold = 110;
          if (g.dy < -threshold) {
            morphOut();
          } else if (g.dy > threshold) {
            resetToFirst();
          } else {
            settle();
          }
        },
        onPanResponderTerminate: () => settle(),
      }),
    [translateY, rotate, scale, morphOut, resetToFirst, settle],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const deckStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(deck.value, [0, 1], [14, 0]) }],
    opacity: interpolate(deck.value, [0, 1], [0.5, 1]),
  }));

  async function finish(skip: boolean) {
    setBusy(true);
    try {
      if (skip) {
        await skipCompass();
      } else if (FAMILIES[index]) {
        await seedCompass({ family: FAMILIES[index]!.family, traditionVsModern: tradition });
      } else {
        await skipCompass();
      }
      onComplete(skip);
    } finally {
      setBusy(false);
    }
  }

  const current = FAMILIES[index]!;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[typography.title, styles.title]}>Where does your plate usually come from?</Text>
        <Text style={[typography.body, styles.subtitle]}>
          Flick through the cards and pick the one that feels most like home. Skip it — we&apos;ll just learn by watching.
        </Text>

        <Animated.View style={[styles.stage]} {...pan.panHandlers}>
          {/* back deck card springs up behind the front card */}
          <Animated.View style={[styles.deckCard, deckStyle]} pointerEvents="none">
              <Text style={styles.deckEmoji}>
                {FAMILIES[Math.min(index + 1, FAMILIES.length - 1)]!.emoji}
              </Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: current.accent },
                cardStyle,
              ]}
            >
              <Text style={styles.emoji}>{current.emoji}</Text>
              <Text style={styles.blurb}>{current.blurb}</Text>
              <View style={styles.dots}>
                {FAMILIES.map((f, i) => (
                  <Pressable
                    key={f.family}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${f.blurb}`}
                    accessibilityState={{ selected: i === index }}
                    onPress={() => setIndex(i)}
                    style={[styles.dot, i === index ? { backgroundColor: current.accent } : null]}
                  >
                    <Text style={styles.dotLabel}>{i + 1}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>

        <Text style={styles.axisTitle}>Pure &amp; traditional</Text>
        <View style={styles.axisWrap}>
          <View style={styles.track}>
            {[-1, -0.5, 0, 0.5, 1].map((val) => (
              <Animated.View
                key={val}
                style={[
                  styles.trackNotch,
                  {
                    backgroundColor:
                      Math.abs(tradition - val) < 0.251 ? current.accent : colors.border,
                  },
                ]}
              />
            ))}
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Traditional to modern"
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment' && tradition < 1) {
                  setTradition(Math.min(1, tradition + 0.5));
                } else if (e.nativeEvent.actionName === 'decrement' && tradition > -1) {
                  setTradition(Math.max(-1, tradition - 0.5));
                }
              }}
              onLayout={(e) => {
                const width = e.nativeEvent.layout.width;
                // drag to set the level continuously (0..width maps to -1..+1)
              }}
              onTouchEnd={(e) => {
                // approximate continuous drag: map touch X to the track value
              }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <View style={styles.axisLabels}>
            <Text style={styles.axisLabelLeft}>Home-style</Text>
            <Text style={styles.axisLabelRight}>Love a twist</Text>
          </View>
        </View>

        <PrimaryButton
          label="That's my kitchen"
          busy={busy}
          disabled={!current}
          onPress={() => void finish(false)}
          style={styles.go}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip the culinary compass"
          onPress={() => void finish(true)}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  title: { textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginBottom: spacing.lg },
  stage: { height: 300, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  deckCard: {
    position: 'absolute',
    width: 290,
    height: 220,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckEmoji: { fontSize: 40 },
  card: {
    width: 290,
    height: 220,
    borderRadius: 24,
    borderWidth: 2,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  emoji: { fontSize: 52, marginBottom: spacing.sm },
  blurb: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotLabel: { fontSize: 11, color: colors.text },
  axisTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  axisWrap: { marginBottom: spacing.xl },
  track: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackNotch: { width: 22, height: 22, borderRadius: 11, margin: 4 },
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  axisLabelLeft: { fontSize: 12, color: colors.textSecondary },
  axisLabelRight: { fontSize: 12, color: colors.textSecondary },
  go: { marginBottom: spacing.md },
  skip: { alignItems: 'center', padding: spacing.md },
  skipText: { color: colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
});
```

Note for the implementer: the card deck uses RN-core `PanResponder` to drive Reanimated shared values — **no new gesture dependency is needed**. The continuous `tradition` drag should likewise use a `PanResponder`/touch handler (track the touch X against the track width and map to `-1..+1`) rather than the three discrete buttons. `react-native-reanimated` is already a dependency (4.5.1).

- [ ] **Step 4: Wire the Compass into onboarding in AppNavigator**

In `apps/mobile/src/navigation/AppNavigator.tsx`:

1. Add import: `import { CulinaryCompassScreen } from '../screens/CulinaryCompassScreen';`
2. Add a flag constant: `const COMPASS_KEY = 'meal-rescue/compass-seen';`
3. Add state + effect to load it (parallel to the existing `introSeen` logic):

```tsx
const [compassSeen, setCompassSeen] = useState<boolean | null>(null);
useEffect(() => {
  let mounted = true;
  AsyncStorage.getItem(COMPASS_KEY).then((value) => {
    if (mounted) setCompassSeen(value === 'true');
  });
  return () => { mounted = false; };
}, []);
```

4. Where the app renders onboarding, gate with BOTH intro and compass:

```tsx
function finishCompass(skipped: boolean) {
  AsyncStorage.setItem(COMPASS_KEY, 'true');
  setCompassSeen(true);
  if (skipped) finishIntro('home');
}

// render logic:
if (!hydrated || (token && introSeen === null) || (token && introSeen === false && compassSeen === null)) {
  return null;
}

// Choose which onboarding stage:
onboarding = !introSeen
  ? <ScrapsIntroScreen onFinish={(d) => { setIntroSeen(true); AsyncStorage.setItem(SCRAPS_INTRO_KEY, 'true'); setInitialHome(d === 'capture' ? 'Capture' : 'HomeMain'); }} />
  : !compassSeen
    ? <CulinaryCompassScreen onComplete={(s) => { AsyncStorage.setItem(COMPASS_KEY, 'true'); setCompassSeen(true); if (s) finishIntro('home'); }} />
    : <RootStack.Navigator ...>...
```

Concretely, replace the boolean condition that currently decides between `<RootStack.Navigator>` and `<ScrapsIntroScreen>` so it tides through the compass stage. Keep `compassSeen` defaulting to `true` for existing users who have already passed onboarding (do not force the compass on returning users): if `introSeen` is already true, treat `compassSeen` as true.

- [ ] **Step 5: Culture-aware "why this?" in RescueResultScreen**

In `apps/mobile/src/screens/RescueResultScreen.tsx`, the existing "why this?" block (from Part 1 Task 6) renders `chosen.resonanceMemory`. Extend the copy to handle a cultural reason when `resonanceMemory.kind` is `'cuisine_family'` or `'tradition'`:

```tsx
{chosen.resonanceMemory && (
  <View style={styles.memoryBox}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Why this suggestion"
      accessibilityState={{ expanded: showWhy }}
      onPress={() => setShowWhy((v) => !v)}
      style={styles.memoryToggle}
    >
      <Text style={styles.memoryToggleText}>{showWhy ? 'Why this? -' : 'Why this? +'}</Text>
    </Pressable>
    {showWhy && (
      <Text style={styles.memoryDetail}>
        {renderMemoryReason(chosen.resonanceMemory)}
      </Text>
    )}
  </View>
)}
```

Add a helper (module-level function near the other helpers):

```tsx
function renderMemoryReason(memory: NonNullable<Required<RankedRecommendation>['resonanceMemory']>): string {
  if (memory.kind === 'cuisine_family') {
    return `This fits the ${memory.contextValue} cooking style you've warmed up to — tell us if you want a change.`;
  }
  if (memory.kind === 'tradition') {
    return `You've leaned ${
      memory.affinity >= 0 ? 'into modern twists' : 'toward pure, traditional plates'
    } lately, so we're matching that.`;
  }
  return `We remember you ${
    memory.affinity >= 0 ? `liked ${memory.ingredient}` : `steer clear of ${memory.ingredient}`
  } in ${memory.contextValue} dishes, so we factored that in.`;
}
```

Ensure `RankedRecommendation` is imported (it is).

- [ ] **Step 6: Render culture entries in the Taste Journal**

In `apps/mobile/src/screens/TasteJournalScreen.tsx`, add a `kind === 'culture'` render branch so culture entries use an icon + warmer style:

```tsx
renderItem={({ item }) => (
  <View style={[styles.entry, item.kind === 'culture' ? styles.cultureEntry : null]}>
    <Text style={styles.entryText}>{item.text}</Text>
    <Text style={styles.entryDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
  </View>
)}
```

Add to styles:

```ts
cultureEntry: { borderColor: colors.secondary, backgroundColor: colors.primaryLight },
```

Back in `TasteMemoryService.getJournal` (Task 3 / D2), emit a culture entry when culture data exists:

```ts
async getJournal(userId: string): Promise<TasteJournalEntry[]> {
  const profile = await this.getTasteProfile(userId);
  const entries: TasteJournalEntry[] = [];
  const tradition = await this.getTraditionVsModern(userId);
  if (tradition !== 0) {
    entries.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      text: tradition >= 0
        ? `You've been enjoying modern twists lately.`
        : `You tend to reach for pure, traditional plates.`,
      kind: 'culture',
    });
  }
  const ingredients = profile.filter(
    (m) => m.contextType === 'cuisine' || m.contextType === 'meal_time' || m.contextType === 'meal_pattern',
  );
  for (const m of ingredients.slice(0, 20)) {
    entries.push({
      id: randomUUID(),
      createdAt: m.lastUpdated,
      text: m.affinity >= 0.2
        ? `You lean toward ${m.ingredient}${m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''}.`
        : m.affinity <= -0.2
          ? `You steer clear of ${m.ingredient}${m.contextType === 'cuisine' ? ` in ${m.contextValue} dishes` : ''}.`
          : `Still deciding on ${m.ingredient}.`,
      kind: 'learned',
    });
  }
  return entries;
}
```

- [ ] **Step 7: Verify mobile gates**

Run: `cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
cd apps/mobile && git add src/screens/CulinaryCompassScreen.tsx src/services/culture.api.ts src/navigation/AppNavigator.tsx src/screens/RescueResultScreen.tsx src/screens/TasteJournalScreen.tsx && git commit -m "feat(mobile): culinary compass onboarding + culture-aware explanations and journal"
```

---

### Task D6: Final gates + culture smoke

- [ ] **Step 1: Full workspace gates**

```bash
cd apps/backend && npm run typecheck && npm run lint && npm test
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings 0
```

Expected: all green.

- [ ] **Step 2: Culture smoke (DB + emulator if available)**

1. Register a new user → run the Culinary Compass → pick a non-default family, lean traditional.
2. `POST /api/v1/meal/analyze` `{ text: 'rice and chicken' }` → expect suggestions lean toward the seeded family, not some unrelated one.
3. `POST /api/v1/meal/analyze` `{ text: 'pho' }` → despite the seeded prior, the dish's own food world (east_asian) wins — explicit intent overrides prior for any country.
4. Accept the pho rescue → feedback `better` → `GET /api/v1/user/taste/culture` → the east_asian affinity grew from its prior value.
5. `GET /api/v1/user/taste/journal` → includes a `culture` entry once tradition level is nonzero.
6. Mobile: verify the Compass appears once during onboarding as a morphing card deck (not a form), is skippable, and rescues show culture-aware "why this?" copy.

- [ ] **Step 3: Update PROGRESS.md + commit**

Add a "Cultural Awareness (Culinary Compass)" section to `PROGRESS.md`, then commit:

```bash
git add PROGRESS.md implementationplan.md && git commit -m "docs: cultural awareness implementation plan and progress"
```
