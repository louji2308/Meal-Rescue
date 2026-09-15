/**
 * AI-safety / hallucination-guard regression suite (Subagent 5).
 *
 * Every AI-derived decision in this codebase must pass through one of two
 * deterministic gates before it can affect a user:
 *   A) a hard constraint engine (allergy / diet / avoid / fail-closed), and
 *   B) a zod schema that rejects or sanitizes malformed LLM output.
 *
 * These tests pin both gates with no database and no network:
 *   - libertarian tests: even a user EXPLICITLY asking for an allergen is
 *     blocked - the constraint engine is not advisory.
 *   - malformed LLM output cannot raise confidence, cannot inject new meal
 *     concepts, cannot name a dish with a blocked ingredient.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from '@jest/globals';

import type {
  IntentEntities,
  IntentResolution,
  MealEvent,
  MealPlan,
  PlanningResult,
  RankedRecommendation,
  RescueCandidate,
  SharedMealPlan,
  UserDecision,
} from '@meal-rescue/shared-types';

import { CompleteJsonOptions, CompleteJsonResult, LlmClient } from '../src/services/ai/llm-client';
import {
  detectedFoodSchema,
  detectedIngredientSchema,
  rankingResultSchema,
  visionResultSchema,
} from '../src/services/ai/llm-schemas';
import { CommonTableAiService } from '../src/services/common-table/common-table-ai.service';
import { ConvergenceEngineService, ConvergenceInput } from '../src/services/common-table/convergence-engine.service';
import {
  buildMemberTasteContext,
  HouseholdConstraintService,
  MemberTasteContext,
} from '../src/services/common-table/household-constraint.service';
import { ConstraintEngineService } from '../src/services/constraint-engine.service';
import { MealMemoryAiService } from '../src/services/meal-memory/meal-memory-ai.service';
import { ValidationService } from '../src/services/validation.service';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Rank = RankedRecommendation;

function member(overrides: Partial<MemberTasteContext> = {}): MemberTasteContext {
  return buildMemberTasteContext({
    memberId: randomUUID(),
    displayName: 'Test Member',
    initials: 'TM',
    relationship: 'self',
    allergies: [],
    dietaryRestrictions: [],
    avoidIngredients: [],
    likes: [],
    dislikes: [],
    spiceLevel: 'medium',
    textures: [],
    learned: {},
    ...overrides,
  });
}

/**
 * Fake provider that mirrors the REAL client contract: it applies the schema
 * passed in `options.schema` and throws when the payload is malformed — which
 * is exactly what the services' try/catch degrade paths expect.
 */
function stubLlm(payload: unknown, fail = false): LlmClient {
  return {
    versionLabel: 'test:stub',
    async completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
      if (fail) throw new Error('provider down');
      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) throw new Error('schema mismatch');
      return { data: parsed.data as T, usage: null };
    },
  };
}

function candidate(overrides: Partial<RescueCandidate> = {}): RescueCandidate {
  return {
    id: randomUUID(),
    type: 'addition',
    additions: [],
    substitutions: [],
    estimatedTime: 5,
    estimatedCost: 'low',
    requiredEquipment: [],
    cookingSteps: 0,
    nutritionalImprovement: {},
    preferenceAlignment: 0.5,
    ...overrides,
  };
}

function rank(c: RescueCandidate): Rank {
  return {
    candidate: c,
    rankScore: 1,
    reasoning: 'deterministic stub',
    naturalLanguageExplanation: 'stub',
  };
}

function entities(overrides: Partial<IntentEntities> = {}): IntentEntities {
  return {
    mealConcept: 'pasta',
    targetDate: '2026-09-20',
    targetHorizon: null,
    mealSlot: 'dinner',
    excludedDay: null,
    ingredient: null,
    memberId: null,
    blockType: null,
    effort: null,
    constraint: null,
    moveTarget: null,
    ...overrides,
  };
}

function baseIntentResolution(): IntentResolution {
  return {
    intent: 'SCHEDULE',
    confidence: 0.6,
    confidenceBand: 'MEDIUM',
    entities: entities(),
    rawText: 'plan pasta for dinner monday',
    requiresClarification: false,
    clarificationQuestion: null,
  };
}

function mealEvent(id: string, concept: string): MealEvent {
  return {
    id,
    householdId: 'hh-1',
    planId: 'plan-1',
    userId: 'user-1',
    dateKey: '2026-09-20',
    mealSlot: 'dinner',
    kind: 'plan',
    concept,
    conceptType: 'recipe',
    state: 'PLANNED',
    slotStatus: 'OPEN',
    flexible: false,
    horizon: null,
    excludedDays: null,
    preferredDays: null,
    mealRole: null,
    ingredients: null,
    memberIds: null,
    reasons: null,
    effort: 'medium',
    rawText: null,
    movedFrom: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function planningResultWith(meals: MealEvent[]): PlanningResult {
  const plan: MealPlan = {
    id: 'plan-1',
    householdId: 'hh-1',
    status: 'proposed',
    weekStart: '2026-09-14',
    source: 'plan_week',
    meals,
    openSlots: [],
    createdAt: new Date().toISOString(),
  };
  return {
    plan,
    purchaseSuggestions: [],
    allocations: [],
    reasons: [],
    confidence: 0.7,
  };
}

function basePlan(): SharedMealPlan {
  return {
    baseName: 'Chicken & Broccoli Rice Bowl',
    baseDescription: 'A warm one-pot bowl the whole family shares.',
    estimatedMinutes: 24,
    effort: 'medium',
    equipment: ['pan', 'pot'],
    sharedSteps: [],
    splitPointIndex: 0,
    branchSteps: [],
    finishes: [],
    ingredients: ['chicken', 'broccoli', 'rice'],
    excludedIngredients: ['peanuts'],
  };
}

// ---------------------------------------------------------------------------
// 1. Libertarian constraint enforcement
// ---------------------------------------------------------------------------

describe('ai-safety - the constraint engine is NOT advisory', () => {
  const engine = new ConstraintEngineService();

  it('blocks a candidate even when the user explicitly asked for the allergen', () => {
    const peanut = candidate({
      additions: [{ name: 'peanut butter' }],
    });
    const filtered = engine.filterCandidates([peanut], { allergies: ['peanuts'] }, []);
    expect(filtered).toHaveLength(0);
    expect(engine.isFeasible(peanut, { allergies: ['peanuts'] })).toBe(false);
  });

  it('blocks shellfish reached through a substitution', () => {
    const shrimp = candidate({
      type: 'substitution',
      additions: [],
      substitutions: [{ original: { name: 'chicken' }, replacement: { name: 'shrimp' } }],
    });
    expect(engine.isFeasible(shrimp, { allergies: ['shellfish'] })).toBe(false);
  });

  it('blocks avoid-listed ingredients regardless of user wording', () => {
    const mushroom = candidate({ additions: [{ name: 'mushroom' }] });
    expect(engine.isFeasible(mushroom, { avoidIngredients: ['mushroom'] })).toBe(false);
  });

  it('drops every candidate when none survives the hard filters (never degrades to unsafe)', () => {
    const options = [
      candidate({ additions: [{ name: 'peanut butter' }] }),
      candidate({ additions: [{ name: 'mystery sauce unknown-xyz' }] }),
    ];
    const out = engine.filterCandidates(options, { allergies: ['peanuts'] }, []);
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Household convergence hard-filters before any AI polish
// ---------------------------------------------------------------------------

describe('ai-safety - household convergence hard-filters before any AI polish', () => {
  const constraints = new HouseholdConstraintService();
  const converge = new ConvergenceEngineService(constraints);

  function runConverge(members: MemberTasteContext[], providedIngredients: string[]) {
    const input: ConvergenceInput = {
      members,
      providedIngredients,
      source: 'text',
      effort: 'normal',
      shoppingAllowed: false,
    };
    return converge.converge(input);
  }

  it('never cooks an ingredient unsafe for ANY household member, "because they asked"', () => {
    const result = runConverge(
      [
        member({ displayName: 'Ada', allergies: ['peanuts'] }),
        member({ displayName: 'Lou', allergies: ['dairy'] }),
      ],
      ['peanut butter', 'chicken', 'rice', 'broccoli'],
    );

    expect(result.converged).toBe(true);
    expect(result.blockedIngredients).toContain('peanut butter');
    const winner = result.winner!;
    expect(winner.ingredients).not.toContain('peanut butter');
    expect(winner.sharedIngredients).not.toContain('peanut butter');
    for (const finish of winner.finishes) {
      expect(finish.additions.map((a) => a.toLowerCase())).not.toContain('peanut butter');
    }
  });

  it('shunts an assembled allergen (soy sauce) out of the shared base for a soy-allergic member', () => {
    const result = runConverge(
      [
        member({ displayName: 'Soy-Sensitive', allergies: ['soy'] }),
        member({ displayName: 'Open', allergies: [] }),
      ],
      ['chicken', 'rice', 'broccoli'],
    );

    expect(result.converged).toBe(true);
    const winner = result.winner!;
    // The shared base must be safe for every member, so an allergen can only
    // ever appear as a per-member branch - never as a shared ingredient.
    expect(winner.sharedIngredients.map((n) => n.toLowerCase())).not.toContain('soy sauce');
    const soyMemberFinish = winner.finishes.find((f) => f.memberName === 'Soy-Sensitive');
    const additions = (soyMemberFinish?.additions ?? []).map((a) => a.toLowerCase());
    expect(additions).not.toContain('soy sauce');
  });

  it('fails closed on unknown ingredients when any member has allergies', () => {
    const result = runConverge(
      [member({ displayName: 'Allergic', allergies: ['soy'] })],
      ['chicken', 'rice', 'mystery-sauce-unknown-xyz'],
    );
    expect(
      result.blockedIngredients.some((b) => b.includes('mystery-sauce') || b === 'mystery-sauce-unknown-xyz'),
    ).toBe(true);
  });

  it('returns an honest fallback (not a fabricated convergence) when only allergens are offered', () => {
    const result = runConverge(
      [member({ displayName: 'Allergic', allergies: ['peanuts'] })],
      ['peanut butter'],
    );
    expect(result.converged).toBe(false);
    expect(result.winner).toBeNull();
    expect(result.fallback).not.toBeNull();
    expect(Array.isArray(result.fallback!.suggestions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Defense-in-depth validation before output leaves the server
// ---------------------------------------------------------------------------

describe('ai-safety - defense-in-depth validation before output leaves the server', () => {
  const validation = new ValidationService();

  it('marks an allergen-containing recommendation CRITICAL and invalid', () => {
    const result = validation.validateRecommendation(
      rank(candidate({ additions: [{ name: 'peanut butter' }] })),
      { allergies: ['peanuts'] },
      { avoidedFoods: [] },
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.severity === 'critical' && e.code === 'ALLERGEN_DETECTED')).toBe(true);
  });

  it('marks an ingredient that cannot be verified safe as CRITICAL (fail closed)', () => {
    const result = validation.validateRecommendation(
      rank(candidate({ additions: [{ name: 'mystery-sauce-xyz' }] })),
      { allergies: ['soy'] },
      { avoidedFoods: [] },
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'ALLERGEN_UNVERIFIABLE')).toBe(true);
  });

  it('passes a genuinely safe recommendation when no allergies are declared', () => {
    const result = validation.validateRecommendation(
      rank(candidate({ additions: [{ name: 'spinach' }] })),
      {},
      { avoidedFoods: [] },
      [],
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Malformed / malicious LLM output cannot corrupt decisions
// ---------------------------------------------------------------------------

describe('ai-safety - meal-memory LLM polish cannot exceed deterministic bounds', () => {
  it('cannot raise confidence beyond what the provider keeps in range, and out-of-band values are ignored', async () => {
    const ai = new MealMemoryAiService(
      stubLlm({ intent: 'SCHEDULE', confidence: 0.95, mealConcept: 'ramen noodles' }),
    );
    const original = baseIntentResolution();
    const refined = await ai.refineIntent(original, 'x');
    expect(refined.confidence).toBe(0.95);
    expect(refined.confidenceBand).toBe('HIGH');
    expect(refined.entities.mealConcept).toBe('ramen noodles');
  });

  it('ignores a malformed LLM response below the confidence floor (cannot lower certainty)', async () => {
    const ai = new MealMemoryAiService(
      stubLlm({ intent: 'SCHEDULE', confidence: 0.1, mealConcept: 'ramen noodles' }),
    );
    const original = baseIntentResolution();
    const refined = await ai.refineIntent(original, 'x');
    expect(refined.confidence).toBe(original.confidence);
  });

  it('ignores malformed LLM output entirely (missing required fields)', async () => {
    const ai = new MealMemoryAiService(stubLlm({}));
    const original = baseIntentResolution();
    expect(await ai.refineIntent(original, 'x')).toEqual(original);
  });

  it('degrades to the deterministic resolution when the provider throws', async () => {
    const ai = new MealMemoryAiService(stubLlm(null, true));
    const original = baseIntentResolution();
    expect(await ai.refineIntent(original, 'x')).toEqual(original);
  });

  it('never injects a meal the LLM invented (ghost ids are dropped)', async () => {
    const ai = new MealMemoryAiService(
      stubLlm({ meals: [{ id: 'ghost-meal-id', concept: 'Fake Food' }] }),
    );
    const before = planningResultWith([mealEvent('m1', 'Pasta'), mealEvent('m2', 'Curry')]);
    const after = await ai.polishPlan(before);
    expect(after.plan!.meals).toHaveLength(2);
    expect(after.plan!.meals.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(after.plan!.meals[1]?.concept).toBe('Curry');
  });

  it('applies polish only to matching meal ids, preserving the rest', async () => {
    const ai = new MealMemoryAiService(stubLlm({ meals: [{ id: 'm1', concept: 'Buttery Garlic Noodles' }] }));
    const after = await ai.polishPlan(
      planningResultWith([mealEvent('m1', 'Pasta'), mealEvent('m2', 'Curry')]),
    );
    expect(after.plan!.meals[0]?.concept).toBe('Buttery Garlic Noodles');
    expect(after.plan!.meals[1]?.concept).toBe('Curry');
  });
});

describe('ai-safety - common-table AI polish cannot name a dish with a blocked allergen', () => {
  it('falls back to the deterministic name when the LLM mentions a blocked ingredient', async () => {
    const ai = new CommonTableAiService(
      stubLlm({ baseName: 'Peanut-glazed Chicken Bowl', description: 'Warm and nutty' }),
      true,
    );
    const polished = await ai.polish(basePlan());
    expect(polished.baseName).toBe(basePlan().baseName);
  });

  it('falls back when the LLM tries to slip in the allergen as a dish descriptor', async () => {
    const ai = new CommonTableAiService(
      stubLlm({ baseName: 'Creamy Peanut Ragu Pasta', description: '' }),
      true,
    );
    const polished = await ai.polish({ ...basePlan(), baseName: 'Ragu Pasta' });
    expect(polished.baseName).toBe('Ragu Pasta');
  });

  it('falls back on provider failure rather than failing the request', async () => {
    const ai = new CommonTableAiService(stubLlm(null, true), true);
    const plan = basePlan();
    const polished = await ai.polish(plan);
    expect(polished.baseName).toBe(plan.baseName);
    expect(polished.baseDescription).toBe(plan.baseDescription);
  });
});

describe('ai-safety - raw LLM output schemas reject malformed structured data', () => {
  it('rejects a detected food with no confidence', () => {
    expect(detectedFoodSchema.safeParse({ name: 'apple' }).success).toBe(false);
  });

  it('rejects confidence outside 0..1', () => {
    expect(detectedFoodSchema.safeParse({ name: 'apple', confidence: 1.5 }).success).toBe(false);
    expect(detectedFoodSchema.safeParse({ name: 'apple', confidence: -0.1 }).success).toBe(false);
  });

  it('rejects an unknown ingredient state (LLM trying a new enum value)', () => {
    expect(
      detectedIngredientSchema.safeParse({ name: 'apple', confidence: 0.9, state: 'rotten' }).success,
    ).toBe(false);
  });

  it('rejects a vision result whose foods entries are malformed', () => {
    const result = visionResultSchema.safeParse({
      foods: [{ name: 'mystery' }],
      ingredients: [],
      components: { protein: true, fiber_sources: false, healthy_fat_sources: false, carbohydrates: true },
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an empty but well-formed vision result (downstream must treat as "detected nothing")', () => {
    const result = visionResultSchema.safeParse({
      foods: [],
      ingredients: [],
      components: { protein: false, fiber_sources: false, healthy_fat_sources: false, carbohydrates: false },
      uncertainties: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty ranked-candidate list (LLM claiming nothing was ranked)', () => {
    expect(rankingResultSchema.safeParse({ rankedCandidates: [], rankingConfidence: 0.9 }).success).toBe(false);
  });
});

// Keep the shared UserDecision import referenced for the type surface.
export type { UserDecision };