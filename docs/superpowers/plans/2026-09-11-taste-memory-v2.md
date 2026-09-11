# Taste Memory V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat ingredient-affinity taste memory with an event-sourced, context-aware system that tracks sensory preferences, treatment preferences, ingredient roles, combination memory, exposure, and modification style — so the AI rescue can reason about "what kind of change does THIS person enjoy for THIS meal RIGHT NOW."

**Architecture:** Event-sourced taste system. Raw `taste_events` are immutable facts. `taste_beliefs` are derived aggregates updated after each event. `taste_exposure` tracks recent recommendations separately. The LLM receives a compact `RescueTasteContext` built from beliefs, not raw events. Existing `taste_memories` table becomes beliefs (renamed columns, expanded context types).

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL (Sequelize), Redis, OpenRouter (LLM), React Native (Expo)

## Global Constraints

- `react-native-google-mobile-ads` pinned at exactly `15.8.3` (NOT `^16.5.0`)
- Railway deploy: use `railway up --service Meal-Rescue` (NOT `railway redeploy`)
- Backend target port: 3010, live at `https://meal-rescue-production.up.railway.app`
- OpenRouter key stored as `OPENAI_API_KEY` env var on Railway
- Husky pre-commit broken on Node v24 — use `--no-verify` for commits
- `&&` not valid in PowerShell — use `;` instead
- Sequelize sync: `alter: true` always on
- Mobile `.env`: `EXPO_PUBLIC_API_BASE_URL=https://meal-rescue-production.up.railway.app`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `apps/backend/src/database/models/taste-event.model.ts` | `taste_events` table — immutable event log |
| `apps/backend/src/database/models/taste-exposure.model.ts` | `taste_exposure` table — recent exposure tracking |
| `apps/backend/src/database/models/taste-combination.model.ts` | `taste_combinations` table — ingredient pairs that worked |
| `apps/backend/src/services/taste-event.service.ts` | Event emission + belief derivation |
| `apps/backend/src/services/taste-exposure.service.ts` | Exposure tracking + decay |
| `apps/backend/src/services/taste-combination.service.ts` | Combination memory CRUD |
| `apps/backend/src/services/taste-context-builder.service.ts` | Builds `RescueTasteContext` for LLM |
| `apps/backend/src/services/taste-belief-updater.service.ts` | Derives beliefs from events |
| `apps/backend/src/services/ai-rescue-v2.service.ts` | New AI rescue using taste context |
| `packages/shared-types/src/taste-v2.ts` | All V2 type definitions |

### Modified Files

| File | Change |
|------|--------|
| `apps/backend/src/database/models/index.ts` | Register new models + associations |
| `apps/backend/src/services/taste-memory.service.ts` | Refactor to use events, expand context types |
| `apps/backend/src/services/feedback.service.ts` | Emit events instead of direct belief writes |
| `apps/backend/src/services/composition.ts` | Wire new services |
| `apps/backend/src/services/ai-rescue.service.ts` | Consume `RescueTasteContext` |
| `apps/backend/src/services/ai/prompts.ts` | New prompt with taste context |
| `packages/shared-types/src/index.ts` | Export V2 types, expand `TasteContextType` |
| `apps/backend/src/routes/user.routes.ts` | New endpoints for exposure, combinations |

---

# PHASE 1: Event Sourcing + Exposure

> Foundation. Everything else builds on this. Delivers: no more "egg every day" problem.

---

## Task 1: V2 Type Definitions

**Files:**
- Create: `packages/shared-types/src/taste-v2.ts`
- Modify: `packages/shared-types/src/index.ts:266-278`

**Interfaces:**
- Produces: All V2 types consumed by every subsequent task

- [ ] **Step 1: Create taste-v2.ts with all type definitions**

```typescript
// packages/shared-types/src/taste-v2.ts

import { Confidence, ISO8601, UUID } from './index';

// --- Target Types ---
export type TasteTargetType =
  | 'ingredient'
  | 'sensory'
  | 'treatment'
  | 'role'
  | 'combination'
  | 'modification'
  | 'cuisine'
  | 'cuisine_style';

// --- Event Types ---
export type TasteEventType =
  | 'EXPLICIT_LIKE'
  | 'EXPLICIT_DISLIKE'
  | 'CURRENT_WANT'
  | 'RESCUE_ACCEPTED'
  | 'RESCUE_REJECTED'
  | 'RESCUE_SWAPPED'
  | 'MEAL_COMPLETED'
  | 'SATISFACTION_NAILED'
  | 'SATISFACTION_ALMOST'
  | 'SATISFACTION_NOT_FOR_ME'
  | 'ONBOARDING_COMPLETED'
  | 'EXPOSURE_RECOMMENDED'
  | 'EXPOSURE_COMPLETED';

// --- Sensory Dimensions ---
export type FlavorDimension =
  | 'savory' | 'sweet' | 'sour' | 'spicy' | 'umami'
  | 'bitter' | 'rich' | 'smoky' | 'fresh' | 'tangy';

export type TextureDimension =
  | 'crispy' | 'crunchy' | 'creamy' | 'soft' | 'chewy'
  | 'juicy' | 'silky' | 'chunky';

export type TemperatureDimension = 'hot' | 'warm' | 'cold' | 'cool';
export type IntensityDimension = 'mild' | 'moderate' | 'bold' | 'very_intense';

// --- Food Roles ---
export type FoodRole =
  | 'protein' | 'fibre' | 'creaminess' | 'crunch' | 'acidity'
  | 'heat' | 'freshness' | 'richness' | 'sweetness' | 'saltiness'
  | 'sauce' | 'moisture' | 'bulk' | 'contrast' | 'aroma';

// --- Treatment Types ---
export type TreatmentType =
  | 'add_fresh' | 'roast' | 'fry' | 'grill' | 'toast'
  | 'crisp' | 'blend' | 'mash' | 'chop' | 'pickle'
  | 'season' | 'sauce' | 'garnish' | 'mix_in' | 'serve_alongside'
  | 'use_as_topping' | 'use_as_filling';

// --- Modification Magnitude ---
export type ModificationMagnitude =
  | 'tiny' | 'small' | 'moderate' | 'large' | 'transformative';

// --- Rescue Mode ---
export type RescueMode = 'REINFORCE' | 'VARY' | 'EXPLORE';

// --- Taste Event (immutable) ---
export interface TasteEvent {
  id: UUID;
  userId: UUID;
  eventType: TasteEventType;
  targetType: TasteTargetType;
  targetId: string;
  contextKey: string;
  contextType?: string;
  contextValue?: string;
  treatment?: TreatmentType;
  role?: FoodRole;
  magnitude?: ModificationMagnitude;
  sourceStrength: Confidence;
  attributionConfidence: Confidence;
  rescueId?: UUID;
  mealId?: UUID;
  metadata?: Record<string, unknown>;
  createdAt: ISO8601;
}

// --- Taste Belief (derived, mutable) ---
export interface TasteBelief {
  id: UUID;
  userId: UUID;
  targetType: TasteTargetType;
  targetId: string;
  contextKey: string;
  affinity: Confidence;
  confidence: Confidence;
  positiveEvidence: number;
  negativeEvidence: number;
  observationCount: number;
  stability: Confidence;
  lastObservedAt: ISO8601;
}

// --- Combination Belief ---
export interface CombinationBelief {
  id: UUID;
  userId: UUID;
  members: string[];
  cuisineContext?: string;
  mealContext?: string;
  treatment?: TreatmentType;
  affinity: Confidence;
  confidence: Confidence;
  observationCount: number;
  lastObservedAt: ISO8601;
}

// --- Exposure State ---
export interface ExposureState {
  targetType: TasteTargetType;
  targetId: string;
  recentRecommendations: number;
  recentCompletions: number;
  lastRecommendedAt?: ISO8601;
  lastCompletedAt?: ISO8601;
  consecutiveExposure: number;
}

// --- Rescue Taste Context (compact LLM input) ---
export interface RescueTasteContext {
  currentMeal: {
    foods: string[];
    cuisine?: string;
    cuisineConfidence?: Confidence;
  };
  currentNeed: string[];
  strongPreferences: string[];
  preferredTreatments: TreatmentType[];
  preferredModificationMagnitude: ModificationMagnitude;
  successfulCombinations: string[];
  decisionPreferences: string[];
  recentExposure: string[];
  noveltyTolerance: Confidence;
  cuisineStyle: {
    traditional: Confidence;
    fusion: Confidence;
  };
  preservationPreference: Confidence;
}

// --- Expanded Taste Context Types ---
export type ExpandedTasteContextType =
  | 'cuisine' | 'meal_time' | 'meal_pattern'
  | 'cuisine_family' | 'tradition_vs_modern' | 'global'
  | 'addition_nutritional' | 'addition_sensory' | 'addition_satisfaction'
  | 'addition_modification' | 'addition_exploration' | 'addition_x_meal_group'
  | 'sensory_flavor' | 'sensory_texture' | 'sensory_temperature' | 'sensory_intensity'
  | 'treatment' | 'role' | 'modification_magnitude'
  | 'preservation_preference' | 'novelty_tolerance';
```

- [ ] **Step 2: Export V2 types from index.ts**

Add at the end of `packages/shared-types/src/index.ts`:

```typescript
export * from './taste-v2';
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/shared-types`
Expected: Clean build, no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/taste-v2.ts packages/shared-types/src/index.ts
git commit --no-verify -m "feat(taste-v2): add V2 type definitions for event-sourced taste memory"
```

---

## Task 2: Taste Event Model + Table

**Files:**
- Create: `apps/backend/src/database/models/taste-event.model.ts`
- Modify: `apps/backend/src/database/models/index.ts:1-32,43-57`

**Interfaces:**
- Produces: `TasteEvent` model, `defineTasteEventModel()` function

- [ ] **Step 1: Create taste-event.model.ts**

```typescript
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
 * taste_events - immutable event log.
 * Every taste signal originates here. Events are never updated or deleted.
 * Beliefs are derived aggregates computed from events.
 */
export class TasteEvent extends Model<
  InferAttributes<TasteEvent>,
  InferCreationAttributes<TasteEvent>
> {
  declare id: UUID;
  declare userId: UUID;
  declare eventType: string;
  declare targetType: string;
  declare targetId: string;
  declare contextKey: string;
  declare contextType: CreationOptional<string | null>;
  declare contextValue: CreationOptional<string | null>;
  declare treatment: CreationOptional<string | null>;
  declare role: CreationOptional<string | null>;
  declare magnitude: CreationOptional<string | null>;
  declare sourceStrength: number;
  declare attributionConfidence: number;
  declare rescueId: CreationOptional<UUID | null>;
  declare mealId: CreationOptional<UUID | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
}

export function defineTasteEventModel(sequelize: Sequelize): typeof TasteEvent {
  TasteEvent.init(
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
      eventType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextKey: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      contextType: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      contextValue: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      treatment: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      magnitude: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      sourceStrength: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      attributionConfidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      rescueId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'rescues', key: 'id' },
      },
      mealId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'meals', key: 'id' },
      },
      metadata: {
        type: DataTypes.JSONB,
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
      modelName: 'TasteEvent',
      tableName: 'taste_events',
      underscored: true,
      timestamps: false,
      indexes: [
        { name: 'idx_taste_events_user', fields: ['user_id'] },
        { name: 'idx_taste_events_user_type', fields: ['user_id', 'event_type'] },
        { name: 'idx_taste_events_user_target', fields: ['user_id', 'target_type', 'target_id'] },
        { name: 'idx_taste_events_created', fields: ['created_at'] },
      ],
    },
  );
  return TasteEvent;
}
```

- [ ] **Step 2: Register model in index.ts**

Add import at top of `apps/backend/src/database/models/index.ts`:
```typescript
import { TasteEvent, defineTasteEventModel } from './taste-event.model';
```

Add to `DbModels` interface:
```typescript
TasteEvent: typeof TasteEvent;
```

Add to `initializeModels()`:
```typescript
TasteEvent: defineTasteEventModel(sequelize),
```

Add association after line 103:
```typescript
models.User.hasMany(models.TasteEvent, {
  foreignKey: { name: 'userId', allowNull: false },
});
models.TasteEvent.belongsTo(models.User, {
  foreignKey: { name: 'userId', allowNull: false },
});
```

Add to `dbModels` export:
```typescript
TasteEvent,
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/models/taste-event.model.ts apps/backend/src/database/models/index.ts
git commit --no-verify -m "feat(taste-v2): add taste_events table model"
```

---

## Task 3: Taste Exposure Model + Table

**Files:**
- Create: `apps/backend/src/database/models/taste-exposure.model.ts`
- Modify: `apps/backend/src/database/models/index.ts`

**Interfaces:**
- Produces: `TasteExposure` model, `defineTasteExposureModel()` function

- [ ] **Step 1: Create taste-exposure.model.ts**

```typescript
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
 * taste_exposure - tracks recent exposure to prevent repetition.
 * Separate from beliefs: exposure never changes preference by itself,
 * it affects candidate ranking.
 */
export class TasteExposure extends Model<
  InferAttributes<TasteExposure>,
  InferCreationAttributes<TasteExposure>
> {
  declare id: UUID;
  declare userId: UUID;
  declare targetType: string;
  declare targetId: string;
  declare recentRecommendations: number;
  declare recentCompletions: number;
  declare lastRecommendedAt: CreationOptional<Date | null>;
  declare lastCompletedAt: CreationOptional<Date | null>;
  declare consecutiveExposure: number;
  declare windowStart: CreationOptional<Date>;
}

export function defineTasteExposureModel(sequelize: Sequelize): typeof TasteExposure {
  TasteExposure.init(
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
      targetType: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      recentRecommendations: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      recentCompletions: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastRecommendedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastCompletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      consecutiveExposure: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      windowStart: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteExposure',
      tableName: 'taste_exposure',
      underscored: true,
      timestamps: false,
      indexes: [
        {
          unique: true,
          name: 'uq_taste_exposure_user_target',
          fields: ['user_id', 'target_type', 'target_id'],
        },
      ],
    },
  );
  return TasteExposure;
}
```

- [ ] **Step 2: Register model in index.ts**

Same pattern as Task 2 — add import, DbModels entry, initializeModels entry, association, dbModels export.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/models/taste-exposure.model.ts apps/backend/src/database/models/index.ts
git commit --no-verify -m "feat(taste-v2): add taste_exposure table model"
```

---

## Task 4: Taste Combination Model + Table

**Files:**
- Create: `apps/backend/src/database/models/taste-combination.model.ts`
- Modify: `apps/backend/src/database/models/index.ts`

- [ ] **Step 1: Create taste-combination.model.ts**

```typescript
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
 * taste_combinations - learns what ingredient pairs work for this person.
 * Not "egg = liked" + "noodles = liked" but "egg + noodles = successful".
 */
export class TasteCombination extends Model<
  InferAttributes<TasteCombination>,
  InferCreationAttributes<TasteCombination>
> {
  declare id: UUID;
  declare userId: UUID;
  declare members: string[];
  declare cuisineContext: CreationOptional<string | null>;
  declare mealContext: CreationOptional<string | null>;
  declare treatment: CreationOptional<string | null>;
  declare affinity: number;
  declare confidence: number;
  declare observationCount: number;
  declare lastObservedAt: Date;
}

export function defineTasteCombinationModel(sequelize: Sequelize): typeof TasteCombination {
  TasteCombination.init(
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
      members: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
      },
      cuisineContext: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      mealContext: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      treatment: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      affinity: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0,
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.3,
      },
      observationCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      lastObservedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'TasteCombination',
      tableName: 'taste_combinations',
      underscored: true,
      timestamps: false,
      indexes: [
        { name: 'idx_taste_combinations_user', fields: ['user_id'] },
      ],
    },
  );
  return TasteCombination;
}
```

- [ ] **Step 2: Register model in index.ts**

Same pattern as Tasks 2-3.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/database/models/taste-combination.model.ts apps/backend/src/database/models/index.ts
git commit --no-verify -m "feat(taste-v2): add taste_combinations table model"
```

---

## Task 5: Taste Event Service (Event Emission)

**Files:**
- Create: `apps/backend/src/services/taste-event.service.ts`
- Modify: `apps/backend/src/services/composition.ts`

**Interfaces:**
- Consumes: `TasteEvent` model from Task 2
- Produces: `TasteEventService.emit()`, `TasteEventService.getRecentByUser()`

- [ ] **Step 1: Create taste-event.service.ts**

```typescript
import { randomUUID } from 'node:crypto';

import type { TasteEvent, TasteEventType, TasteTargetType } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

/**
 * TasteEventService - emits immutable taste events.
 *
 * Every taste signal flows through here. Events are never updated or deleted.
 * Belief derivation happens asynchronously after emission.
 */
export class TasteEventService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async emit(args: {
    userId: string;
    eventType: TasteEventType;
    targetType: TasteTargetType;
    targetId: string;
    contextKey: string;
    contextType?: string;
    contextValue?: string;
    treatment?: string;
    role?: string;
    magnitude?: string;
    sourceStrength?: number;
    attributionConfidence?: number;
    rescueId?: string;
    mealId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TasteEvent> {
    const event = await this.models.TasteEvent.create({
      id: randomUUID(),
      userId: args.userId,
      eventType: args.eventType,
      targetType: args.targetType,
      targetId: args.targetId.toLowerCase(),
      contextKey: args.contextKey,
      contextType: args.contextType ?? null,
      contextValue: args.contextValue ?? null,
      treatment: args.treatment ?? null,
      role: args.role ?? null,
      magnitude: args.magnitude ?? null,
      sourceStrength: args.sourceStrength ?? 0.5,
      attributionConfidence: args.attributionConfidence ?? 0.5,
      rescueId: args.rescueId ?? null,
      mealId: args.mealId ?? null,
      metadata: args.metadata ?? null,
      createdAt: new Date(),
    });

    return event.get() as unknown as TasteEvent;
  }

  async getRecentByUser(
    userId: string,
    options?: { limit?: number; since?: Date; eventType?: TasteEventType },
  ): Promise<TasteEvent[]> {
    const where: Record<string, unknown> = { userId };
    if (options?.eventType) where.eventType = options.eventType;

    const rows = await this.models.TasteEvent.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: options?.limit ?? 50,
    });

    let events = rows.map((r) => r.get() as unknown as TasteEvent);
    if (options?.since) {
      events = events.filter((e) => new Date(e.createdAt) >= options.since!);
    }
    return events;
  }

  async countByTarget(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
    options?: { withinDays?: number },
  ): Promise<{ recommended: number; completed: number }> {
    const since = options?.withinDays
      ? new Date(Date.now() - options.withinDays * 86400000)
      : undefined;

    const events = await this.getRecentByUser(userId, {
      limit: 100,
      since,
    });

    const relevant = events.filter(
      (e) => e.targetType === targetType && e.targetId === targetId.toLowerCase(),
    );

    return {
      recommended: relevant.filter(
        (e) => e.eventType === 'EXPOSURE_RECOMMENDED',
      ).length,
      completed: relevant.filter(
        (e) => e.eventType === 'EXPOSURE_COMPLETED' || e.eventType === 'MEAL_COMPLETED',
      ).length,
    };
  }
}
```

- [ ] **Step 2: Wire into composition.ts**

Add to imports in `apps/backend/src/services/composition.ts`:
```typescript
import { TasteEventService } from './taste-event.service';
```

Add to models object:
```typescript
TasteEvent,
```

Add to `buildServices()` return type and body:
```typescript
tasteEvents: TasteEventService;
// ...
tasteEvents: new TasteEventService(models),
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/taste-event.service.ts apps/backend/src/services/composition.ts
git commit --no-verify -m "feat(taste-v2): add TasteEventService for event emission"
```

---

## Task 6: Taste Exposure Service

**Files:**
- Create: `apps/backend/src/services/taste-exposure.service.ts`
- Modify: `apps/backend/src/services/composition.ts`

**Interfaces:**
- Consumes: `TasteExposure` model from Task 3, `TasteEventService` from Task 5
- Produces: `TasteExposureService.recordRecommendation()`, `TasteExposureService.recordCompletion()`, `TasteExposureService.getExposure()`, `TasteExposureService.getOverexposed()`

- [ ] **Step 1: Create taste-exposure.service.ts**

```typescript
import { randomUUID } from 'node:crypto';

import type { ExposureState, TasteTargetType } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

const EXPOSURE_WINDOW_DAYS = 14;
const OVEREXPOSURE_THRESHOLD = 3;
const DECAY_INTERVAL_MS = EXPOSURE_WINDOW_DAYS * 86400000;

/**
 * TasteExposureService - tracks recent exposure to prevent repetition.
 *
 * Exposure never changes preference by itself. It affects candidate ranking.
 * A high-affinity ingredient that was recommended 4 times this week should
 * lose to a slightly less exciting alternative.
 */
export class TasteExposureService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async recordRecommendation(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<void> {
    const row = await this.getOrCreate(userId, targetType, targetId);
    row.recentRecommendations += 1;
    row.consecutiveExposure += 1;
    row.lastRecommendedAt = new Date();
    await row.save();
  }

  async recordCompletion(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<void> {
    const row = await this.getOrCreate(userId, targetType, targetId);
    row.recentCompletions += 1;
    row.consecutiveExposure = 0;
    row.lastCompletedAt = new Date();
    await row.save();
  }

  async getExposure(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<ExposureState> {
    const row = await this.models.TasteExposure.findOne({
      where: { userId, targetType, targetId: targetId.toLowerCase() },
    });

    if (!row) {
      return {
        targetType,
        targetId,
        recentRecommendations: 0,
        recentCompletions: 0,
        consecutiveExposure: 0,
      };
    }

    const data = row.get();
    // Decay if window expired
    if (Date.now() - new Date(data.windowStart).getTime() > DECAY_INTERVAL_MS) {
      data.recentRecommendations = Math.max(0, data.recentRecommendations - 1);
      data.recentCompletions = Math.max(0, data.recentCompletions - 1);
      data.windowStart = new Date();
      await row.save();
    }

    return {
      targetType: data.targetType,
      targetId: data.targetId,
      recentRecommendations: data.recentRecommendations,
      recentCompletions: data.recentCompletions,
      lastRecommendedAt: data.lastRecommendedAt?.toISOString(),
      lastCompletedAt: data.lastCompletedAt?.toISOString(),
      consecutiveExposure: data.consecutiveExposure,
    };
  }

  async getOverexposed(userId: string, withinDays = 7): Promise<string[]> {
    const since = new Date(Date.now() - withinDays * 86400000);
    const rows = await this.models.TasteExposure.findAll({
      where: { userId },
    });

    return rows
      .filter((r) => {
        const data = r.get();
        return (
          data.recentRecommendations >= OVEREXPOSURE_THRESHOLD ||
          (data.lastRecommendedAt && data.lastRecommendedAt >= since)
        );
      })
      .map((r) => r.get().targetId);
  }

  private async getOrCreate(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<InstanceType<typeof Db['models']['TasteExposure']>> {
    const normalizedId = targetId.toLowerCase();
    const existing = await this.models.TasteExposure.findOne({
      where: { userId, targetType, targetId: normalizedId },
    });

    if (existing) return existing;

    return this.models.TasteExposure.create({
      id: randomUUID(),
      userId,
      targetType,
      targetId: normalizedId,
      recentRecommendations: 0,
      recentCompletions: 0,
      consecutiveExposure: 0,
      windowStart: new Date(),
    });
  }
}
```

- [ ] **Step 2: Wire into composition.ts**

Add import, models entry, and `buildServices()` return:
```typescript
import { TasteExposureService } from './taste-exposure.service';
// ...
tasteExposure: TasteExposureService;
// ...
tasteExposure: new TasteExposureService(models),
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/taste-exposure.service.ts apps/backend/src/services/composition.ts
git commit --no-verify -m "feat(taste-v2): add TasteExposureService for repetition tracking"
```

---

## Task 7: Refactor FeedbackService to Emit Events

**Files:**
- Modify: `apps/backend/src/services/feedback.service.ts:124-127`
- Modify: `apps/backend/src/services/composition.ts`

**Interfaces:**
- Consumes: `TasteEventService` from Task 5
- Produces: Events emitted on every decision/feedback

- [ ] **Step 1: Add TasteEventService to FeedbackService constructor**

In `apps/backend/src/services/feedback.service.ts`, add import:
```typescript
import { TasteEventService } from './taste-event.service';
```

Change constructor to accept and store TasteEventService:
```typescript
constructor(models: Db['models'], tasteEvents: TasteEventService) {
  this.models = models;
  this.preferenceLearning = new PreferenceLearningService(models);
  this.decisionEvents = new DecisionEventService(models);
  this.tasteEvents = tasteEvents;
}
```

Add field:
```typescript
private readonly tasteEvents: TasteEventService;
```

- [ ] **Step 2: Emit events after decision recording (line ~127)**

After the existing `tasteMemory.recordDecision()` call, add event emission:

```typescript
// Emit V2 taste events
const candidate = (selectedRecommendation.candidate as
  | { additions?: Array<{ name: string }>; substitutions?: Array<{ replacement: { name: string } }> }
  | undefined) ?? { additions: [], substitutions: [] };

const ingredientNames = [
  ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
  ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
];

const eventType = rescue.userDecision === 'accepted'
  ? 'RESCUE_ACCEPTED'
  : rescue.userDecision === 'swapped'
    ? 'RESCUE_SWAPPED'
    : 'RESCUE_REJECTED';

for (const name of ingredientNames) {
  await this.tasteEvents.emit({
    userId,
    eventType,
    targetType: 'ingredient',
    targetId: name,
    contextKey: `rescue:${rescueId}`,
    sourceStrength: eventType === 'RESCUE_REJECTED' ? 0.7 : 0.5,
    attributionConfidence: 0.5,
    rescueId,
  });
}
```

- [ ] **Step 3: Emit events after satisfaction feedback**

After the existing `tasteMemory.recordFeedback()` call, add:

```typescript
const satisfactionEventType = satisfaction === 'better'
  ? 'SATISFACTION_NAILED'
  : satisfaction === 'not_for_me'
    ? 'SATISFACTION_NOT_FOR_ME'
    : 'SATISFACTION_ALMOST';

for (const name of ingredientNames) {
  await this.tasteEvents.emit({
    userId,
    eventType: satisfactionEventType,
    targetType: 'ingredient',
    targetId: name,
    contextKey: `rescue:${rescueId}`,
    sourceStrength: satisfaction === 'better' ? 0.8 : satisfaction === 'not_for_me' ? 0.9 : 0.4,
    attributionConfidence: 0.6,
    rescueId,
  });
}
```

- [ ] **Step 4: Update composition.ts to pass TasteEventService to FeedbackService**

```typescript
const tasteEvents = new TasteEventService(models);
// ...
feedback: new FeedbackService(models, tasteEvents),
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/feedback.service.ts apps/backend/src/services/composition.ts
git commit --no-verify -m "feat(taste-v2): FeedbackService now emits taste events alongside V1 beliefs"
```

---

## Task 8: Deploy + Verify Phase 1

**Files:**
- None (deployment only)

- [ ] **Step 1: Build and verify locally**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 3: Deploy to Railway**

```bash
railway up --service Meal-Rescue
```

Wait for build to complete (~2-3 minutes).

- [ ] **Step 4: Verify health**

```powershell
Invoke-WebRequest -Uri "https://meal-rescue-production.up.railway.app/health" -UseBasicParsing
```

Expected: `{"status":"ok",...}`

- [ ] **Step 5: Verify existing endpoints still work**

Register a test user and test the existing rescue flow to confirm no regressions.

- [ ] **Step 6: Verify new tables exist**

Check Railway logs for Sequelize sync creating `taste_events`, `taste_exposure`, `taste_combinations` tables.

---

# PHASE 2: Belief Expansion

> Expands beliefs with sensory, treatment, role, and combination dimensions.

---

## Task 9: Expand TasteMemory Model with V2 Context Types

**Files:**
- Modify: `apps/backend/src/database/models/taste-memory.model.ts:34-35`
- Modify: `packages/shared-types/src/index.ts:266-278`

- [ ] **Step 1: Add new context types to TasteContextType**

Expand the union in `packages/shared-types/src/index.ts`:
```typescript
export type TasteContextType =
  | 'cuisine' | 'meal_time' | 'meal_pattern'
  | 'cuisine_family' | 'tradition_vs_modern' | 'global'
  | 'addition_nutritional' | 'addition_sensory' | 'addition_satisfaction'
  | 'addition_modification' | 'addition_exploration' | 'addition_x_meal_group'
  | 'sensory_flavor' | 'sensory_texture' | 'sensory_temperature' | 'sensory_intensity'
  | 'treatment' | 'role' | 'modification_magnitude'
  | 'preservation_preference' | 'novelty_tolerance';
```

- [ ] **Step 2: Update TasteMemoryContextType in model**

```typescript
export type TasteMemoryContextType =
  | 'cuisine' | 'meal_time' | 'meal_pattern' | 'cuisine_family'
  | 'tradition_vs_modern' | 'global'
  | 'sensory_flavor' | 'sensory_texture' | 'sensory_temperature' | 'sensory_intensity'
  | 'treatment' | 'role' | 'modification_magnitude'
  | 'preservation_preference' | 'novelty_tolerance';
```

- [ ] **Step 3: Expand contextValue column width if needed**

The existing `STRING(100)` for `contextValue` should be sufficient for new context types.

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/shared-types && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/models/taste-memory.model.ts packages/shared-types/src/index.ts
git commit --no-verify -m "feat(taste-v2): expand TasteContextType with sensory, treatment, role dimensions"
```

---

## Task 10: Sensory Preference Recording

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts`

**Interfaces:**
- Consumes: `TasteEventService` from Task 5
- Produces: `TasteMemoryService.recordSensoryPreference()`

- [ ] **Step 1: Add recordSensoryPreference method**

Add to `TasteMemoryService`:

```typescript
async recordSensoryPreference(
  userId: string,
  dimension: 'flavor' | 'texture' | 'temperature' | 'intensity',
  value: string,
  delta: number,
  source: string,
): Promise<void> {
  const contextType = `sensory_${dimension}`;
  await this.applySignal({
    userId,
    ingredient: value,
    contextType,
    contextValue: 'overall',
    affinityDelta: delta,
    confidenceDelta: 0.15,
    source,
  });
}
```

- [ ] **Step 2: Infer sensory signals from events**

Add method to infer sensory preferences from ingredient accept/reject:

```typescript
async inferSensoryFromEvent(
  userId: string,
  ingredient: string,
  positive: boolean,
): Promise<void> {
  // Simple heuristic mapping — expandable later
  const sensoryMap: Record<string, { dimension: string; value: string }[]> = {
    crispy: [{ dimension: 'texture', value: 'crispy' }],
    crunchy: [{ dimension: 'texture', value: 'crunchy' }],
    creamy: [{ dimension: 'texture', value: 'creamy' }],
    spicy: [{ dimension: 'flavor', value: 'spicy' }],
    fresh: [{ dimension: 'flavor', value: 'fresh' }],
    rich: [{ dimension: 'flavor', value: 'rich' }],
    smoky: [{ dimension: 'flavor', value: 'smoky' }],
    sweet: [{ dimension: 'flavor', value: 'sweet' }],
    sour: [{ dimension: 'flavor', value: 'sour' }],
    tangy: [{ dimension: 'flavor', value: 'tangy' }],
    savory: [{ dimension: 'flavor', value: 'savory' }],
    umami: [{ dimension: 'flavor', value: 'umami' }],
  };

  const signals = sensoryMap[ingredient];
  if (!signals) return;

  const delta = positive ? 0.2 : -0.2;
  for (const signal of signals) {
    await this.recordSensoryPreference(
      userId,
      signal.dimension as 'flavor' | 'texture',
      signal.value,
      delta,
      positive ? 'accept' : 'reject',
    );
  }
}
```

- [ ] **Step 3: Wire into event emission**

In `feedback.service.ts`, after emitting ingredient events, call:
```typescript
await tasteMemory.inferSensoryFromEvent(userId, name, eventType !== 'RESCUE_REJECTED');
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/taste-memory.service.ts apps/backend/src/services/feedback.service.ts
git commit --no-verify -m "feat(taste-v2): infer sensory preferences from ingredient events"
```

---

## Task 11: Treatment Preference Recording

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts`

- [ ] **Step 1: Add recordTreatmentPreference method**

```typescript
async recordTreatmentPreference(
  userId: string,
  ingredient: string,
  treatment: string,
  contextType: string,
  contextValue: string,
  delta: number,
  source: string,
): Promise<void> {
  await this.applySignal({
    userId,
    ingredient: `${ingredient}:${treatment}`,
    contextType: 'treatment',
    contextValue: `${contextType}:${contextValue}`,
    affinityDelta: delta,
    confidenceDelta: 0.15,
    source,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/services/taste-memory.service.ts
git commit --no-verify -m "feat(taste-v2): add treatment preference recording"
```

---

## Task 12: Combination Memory Service

**Files:**
- Create: `apps/backend/src/services/taste-combination.service.ts`
- Modify: `apps/backend/src/services/composition.ts`

- [ ] **Step 1: Create taste-combination.service.ts**

```typescript
import { randomUUID } from 'node:crypto';

import type { CombinationBelief } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

/**
 * TasteCombinationService - learns what ingredient pairs work for this person.
 *
 * "egg + noodles = successful" is more useful than "egg = liked" + "noodles = liked".
 * Only promote repeated successful patterns to combination level.
 */
export class TasteCombinationService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async recordCombination(
    userId: string,
    members: string[],
    positive: boolean,
    context?: { cuisine?: string; meal?: string; treatment?: string },
  ): Promise<void> {
    const sorted = [...members].map((m) => m.toLowerCase()).sort();
    const existing = await this.findCombination(userId, sorted, context);

    if (existing) {
      const data = existing.get();
      const delta = positive ? 0.3 : -0.35;
      data.affinity = Math.max(-1, Math.min(1, Number(data.affinity) + delta));
      data.confidence = Math.min(1, Number(data.confidence) + 0.15);
      data.observationCount += 1;
      data.lastObservedAt = new Date();
      await existing.save();
      return;
    }

    if (!positive) return; // Don't create new combination from negative signal

    await this.models.TasteCombination.create({
      id: randomUUID(),
      userId,
      members: sorted,
      cuisineContext: context?.cuisine ?? null,
      mealContext: context?.meal ?? null,
      treatment: context?.treatment ?? null,
      affinity: 0.5,
      confidence: 0.4,
      observationCount: 1,
      lastObservedAt: new Date(),
    });
  }

  async getSuccessfulCombinations(
    userId: string,
    options?: { limit?: number; minConfidence?: number },
  ): Promise<CombinationBelief[]> {
    const rows = await this.models.TasteCombination.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
      limit: options?.limit ?? 20,
    });

    return rows
      .map((r) => r.get() as unknown as CombinationBelief)
      .filter((c) => c.confidence >= (options?.minConfidence ?? 0.3));
  }

  async findCombination(
    userId: string,
    members: string[],
    context?: { cuisine?: string; meal?: string; treatment?: string },
  ): Promise<InstanceType<typeof Db['models']['TasteCombination']> | null> {
    const sorted = [...members].map((m) => m.toLowerCase()).sort();
    const rows = await this.models.TasteCombination.findAll({
      where: { userId },
    });

    return rows.find((r) => {
      const data = r.get();
      const membersMatch =
        data.members.length === sorted.length &&
        data.members.every((m, i) => m === sorted[i]);
      if (!membersMatch) return false;
      if (context?.cuisine && data.cuisineContext !== context.cuisine) return false;
      if (context?.meal && data.mealContext !== context.meal) return false;
      return true;
    }) ?? null;
  }
}
```

- [ ] **Step 2: Wire into composition.ts**

Add import, models entry, and `buildServices()` return.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd "C:\Users\LOUJAN B\Meal Rescue" && npm run build --workspace @meal-rescue/backend`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/taste-combination.service.ts apps/backend/src/services/composition.ts
git commit --no-verify -m "feat(taste-v2): add TasteCombinationService for pair tracking"
```

---

## Task 13: Deploy + Verify Phase 2

- [ ] **Step 1: Build and verify locally**
- [ ] **Step 2: Push to GitHub**
- [ ] **Step 3: Deploy to Railway**
- [ ] **Step 4: Verify health + existing endpoints**
- [ ] **Step 5: Verify new columns/types accessible**

---

# PHASE 3: Cuisine Intelligence

> Cuisine compatibility graph + cross-terms.

---

## Task 14: Cuisine Compatibility Graph

**Files:**
- Create: `apps/backend/src/services/cuisine-compatibility.ts`

- [ ] **Step 1: Create cuisine-compatibility.ts**

Define static compatibility knowledge:
- Native treatments per cuisine family
- Common additions per cuisine
- Adjacent cuisine relationships
- Cross-cuisine distance scores

(Full implementation in dedicated task)

- [ ] **Step 2: Commit**

---

## Task 15: Modification Magnitude Memory

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts`

- [ ] **Step 1: Add recordModificationMagnitude method**

Track whether user prefers tiny/small additions vs major transformations.

- [ ] **Step 2: Commit**

---

## Task 16: Preservation Preference

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts`

- [ ] **Step 1: Add recordPreservationPreference method**

Track `preservation_preference` context type from accept/reject patterns.

- [ ] **Step 2: Commit**

---

## Task 17: Deploy + Verify Phase 3

- [ ] **Step 1-5:** Same deployment pattern as Phase 1-2

---

# PHASE 4: Recommendation Engine + LLM Integration

> The intelligence layer that makes it all work together.

---

## Task 18: Rescue Taste Context Builder

**Files:**
- Create: `apps/backend/src/services/taste-context-builder.service.ts`

**Interfaces:**
- Consumes: All belief services, exposure service, combination service
- Produces: `RescueTasteContext` for LLM

- [ ] **Step 1: Create taste-context-builder.service.ts**

Build compact `RescueTasteContext` from all V2 data:
- Strong preferences from beliefs (|affinity| >= 0.5, confidence >= 0.5)
- Preferred treatments from treatment beliefs
- Successful combinations with high confidence
- Recent exposure from exposure service
- Novelty tolerance from `novelty_tolerance` belief
- Cuisine style from tradition_vs_modern belief
- Preservation preference from `preservation_preference` belief
- Decision preferences (effort, time, cleanup) from decision memories

- [ ] **Step 2: Wire into composition.ts**

- [ ] **Step 3: Verify TypeScript compilation**

- [ ] **Step 4: Commit**

---

## Task 19: "What Could Be Improved?" Classifier

**Files:**
- Create: `apps/backend/src/services/meal-opportunity.classifier.ts`

- [ ] **Step 1: Create classifier**

Classify current meal's improvement dimensions:
- SATISFACTION, FLAVOUR, TEXTURE, RICHNESS, FRESHNESS, CONTRAST
- PROTEIN, FIBRE, VARIETY, PORTION, TEMPERATURE, AROMA, CONVENIENCE

- [ ] **Step 2: Commit**

---

## Task 20: "Same Job, Different Ingredient" Engine

**Files:**
- Create: `apps/backend/src/services/role-matcher.service.ts`

- [ ] **Step 1: Create role-matcher.service.ts**

When preferred ingredient is overexposed, find alternatives fulfilling same role:
- Query taste beliefs for ingredients with same role
- Filter by cuisine compatibility + personal affinity + exposure
- Return ranked alternatives

- [ ] **Step 2: Commit**

---

## Task 21: Rebuild AI Rescue with V2 Taste Context

**Files:**
- Create: `apps/backend/src/services/ai-rescue-v2.service.ts`
- Modify: `apps/backend/src/services/ai/prompts.ts`

- [ ] **Step 1: Create ai-rescue-v2.service.ts**

Use `RescueTasteContext` in prompt instead of raw ingredients.

- [ ] **Step 2: Update prompts.ts with V2 system prompt**

Core instruction: "Given THIS meal, what kind of change does THIS person enjoy, in THIS context, RIGHT NOW, without giving them the same answer every time?"

- [ ] **Step 3: Wire into routes**

- [ ] **Step 4: Deploy + test end-to-end**

- [ ] **Step 5: Commit**

---

## Task 22: Enhanced Taste Journal

**Files:**
- Modify: `apps/backend/src/services/taste-memory.service.ts:214-307`

- [ ] **Step 1: Rebuild getJournal() with V2 data**

Richer entries from sensory, treatment, combination, exposure data.

- [ ] **Step 2: Commit**

---

## Task 23: Final Deploy + Full E2E Test

- [ ] **Step 1: Build + deploy**
- [ ] **Step 2: Test on mobile: Capture → AiRescue → response uses taste profile**
- [ ] **Step 3: Test negotiation: pushback → AI adapts using taste context**
- [ ] **Step 4: Verify Taste Journal shows V2 learnings**
- [ ] **Step 5: Verify exposure prevents repetition**
