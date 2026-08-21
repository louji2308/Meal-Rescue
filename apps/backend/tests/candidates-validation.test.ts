/**
 * Candidate generator + validation service tests.
 * Product rules under test: small candidates only, diverse strategies,
 * validation drops allergen violations outright.
 */
import { randomUUID } from 'node:crypto';

import type { RankedRecommendation, RescueCandidate } from '@meal-rescue/shared-types';

import type { VisionResult } from '../src/services/ai/llm-schemas';
import { CandidateGeneratorService } from '../src/services/candidate-generator.service';
import { ValidationService } from '../src/services/validation.service';

describe('candidate generator', () => {
  const generator = new CandidateGeneratorService();

  const noodleComponents = {
    protein: false,
    fiber_sources: false,
    healthy_fat_sources: false,
    carbohydrates: true,
    sodium_likely_high: true,
  };

  it('fills missing components with small addition candidates', () => {
    const candidates = generator.generateCandidates(
      [{ name: 'instant noodles', confidence: 0.9 }],
      [{ name: 'instant noodles', confidence: 0.9, state: 'cooked' }],
      noodleComponents,
      {},
      {},
      [],
    );

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      // Product rule: one or two ingredients max - never recipe-sized.
      expect(candidate.additions.length).toBeLessThanOrEqual(2);
      expect(Object.keys(candidate.nutritionalImprovement).length).toBeGreaterThan(0);
    }
    const types = new Set(candidates.map((candidate) => candidate.type));
    expect(types.has('addition')).toBe(true);
  });

  it('respects no-cooking constraints when pre-selecting options', () => {
    const candidates = generator.generateCandidates(
      [{ name: 'instant noodles', confidence: 0.9 }],
      [],
      noodleComponents,
      { cookingRequired: false },
      {},
      [],
    );
    for (const candidate of candidates) {
      expect(candidate.cookingSteps).toBe(0);
    }
  });

  it('generates substitution candidates for avoided ingredients', () => {
    const candidates = generator.generateCandidates(
      [{ name: 'toast with egg', confidence: 0.9 }],
      [{ name: 'egg', confidence: 0.9, state: 'cooked' }],
      { protein: true, fiber_sources: false, healthy_fat_sources: false, carbohydrates: true },
      {},
      { avoidedFoods: ['egg'] },
      [],
    );

    const subs = candidates.filter((candidate) => candidate.type === 'substitution');
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0]!.substitutions[0]!.original.name).toBe('egg');
    expect(['firm tofu', 'cottage cheese']).toContain(subs[0]!.substitutions[0]!.replacement.name);
  });

  it('boosts favorites that are already in the pantry', () => {
    const candidates = generator.generateCandidates(
      [{ name: 'instant noodles', confidence: 0.9 }],
      [],
      noodleComponents,
      {},
      { favoriteFoods: ['egg'] },
      ['egg'],
    );

    const eggCandidate = candidates.find((candidate) =>
      candidate.additions.some((addition) => addition.name === 'egg'),
    );
    expect(eggCandidate).toBeDefined();
    expect(eggCandidate!.preferenceAlignment).toBeGreaterThanOrEqual(0.7);
  });

  it('never proposes adding something that is already the meal', () => {
    const candidates = generator.generateCandidates(
      [{ name: 'instant noodles', confidence: 0.9 }],
      [],
      noodleComponents,
      {},
      { favoriteFoods: ['instant noodles'] },
      [],
    );
    expect(
      candidates.some((candidate) =>
        candidate.additions.some((addition) => addition.name === 'instant noodles'),
      ),
    ).toBe(false);
  });
});

describe('validation service', () => {
  const validation = new ValidationService();

  function recommendation(candidateOverrides: Partial<RescueCandidate> = {}): RankedRecommendation {
    return {
      candidate: {
        id: randomUUID(),
        type: 'addition',
        additions: [{ name: 'egg' }],
        substitutions: [],
        estimatedTime: 4,
        estimatedCost: 'low',
        requiredEquipment: [],
        cookingSteps: 2,
        nutritionalImprovement: { protein: 'added' },
        preferenceAlignment: 0.6,
        ...candidateOverrides,
      },
      rankScore: 0.9,
      reasoning: 'test',
      naturalLanguageExplanation: 'test explanation',
    };
  }

  it('invalidates allergen-containing recommendations (critical)', () => {
    const verdict = validation.validateRecommendation(
      recommendation({ additions: [{ name: 'peanut butter' }] }),
      { allergies: ['peanuts'] },
      {},
      [],
    );
    expect(verdict.valid).toBe(false);
    expect(verdict.errors[0]!.code).toBe('ALLERGEN_DETECTED');
  });

  it('fails closed on unknown ingredients when allergies are declared', () => {
    const verdict = validation.validateRecommendation(
      recommendation({ additions: [{ name: 'artisanal sauce x' }] }),
      { allergies: ['soy'] },
      {},
      [],
    );
    expect(verdict.valid).toBe(false);
    expect(verdict.errors[0]!.code).toBe('ALLERGEN_UNVERIFIABLE');
  });

  it('records constraint drift as a major error without invalidating (plan contract)', () => {
    const verdict = validation.validateRecommendation(
      recommendation({ estimatedTime: 45 }),
      { timeMinutes: 10 },
      {},
      [],
    );
    // Only CRITICAL errors invalidate; majors are recorded for observability.
    expect(verdict.valid).toBe(true);
    expect(verdict.errors[0]!.code).toBe('CONSTRAINT_VIOLATION');
    expect(verdict.errors[0]!.severity).toBe('major');
  });

  it('warns (not blocks) when additions are not in the pantry', () => {
    const verdict = validation.validateRecommendation(
      recommendation({ additions: [{ name: 'avocado' }] }),
      {},
      {},
      ['egg'],
    );
    expect(verdict.valid).toBe(true);
    expect(verdict.warnings.some((warning) => warning.code === 'NOT_IN_PANTRY')).toBe(true);
  });
});

// Shared fixture helper used by pipeline integration tests.
export function visionFixtureFor(
  foods: string[],
): Pick<VisionResult, 'foods' | 'ingredients' | 'components' | 'uncertainties'> {
  return {
    foods: foods.map((name) => ({ name, confidence: 0.95 })),
    ingredients: foods.map((name) => ({
      name,
      confidence: 0.9,
      state: 'cooked' as const,
      estimatedQuantity: null,
    })),
    components: {
      protein: false,
      fiber_sources: false,
      healthy_fat_sources: false,
      carbohydrates: true,
      sodium_likely_high: false,
    },
    uncertainties: [],
  };
}
