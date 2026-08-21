/**
 * Constraint engine tests - the deterministic heart of safety filtering.
 * Allergies must fail CLOSED: unknown ingredients are rejected when the
 * user has declared allergies.
 */
import { randomUUID } from 'node:crypto';

import type { RescueCandidate } from '@meal-rescue/shared-types';

import {
  ConstraintEngineService,
  normalizeAllergens,
} from '../src/services/constraint-engine.service';

function candidate(overrides: Partial<RescueCandidate> = {}): RescueCandidate {
  return {
    id: randomUUID(),
    type: 'addition',
    additions: [{ name: 'egg' }],
    substitutions: [],
    estimatedTime: 4,
    estimatedCost: 'low',
    requiredEquipment: ['pan'],
    cookingSteps: 2,
    nutritionalImprovement: { protein: 'added' },
    preferenceAlignment: 0.5,
    ...overrides,
  };
}

describe('constraint engine', () => {
  const engine = new ConstraintEngineService();

  describe('allergies (hard filter)', () => {
    it('rejects candidates containing a declared allergen', () => {
      const peanutButter = candidate({ additions: [{ name: 'peanut butter' }] });
      expect(engine.isFeasible(peanutButter, { allergies: ['peanuts'] })).toBe(false);
    });

    it('rejects allergens reached through substitutions too', () => {
      const sub = candidate({
        additions: [],
        substitutions: [
          {
            original: { name: 'bread' },
            replacement: { name: 'almond butter', costLevel: 'medium' },
          },
        ],
      });
      expect(engine.isFeasible(sub, { allergies: ['tree nuts'] })).toBe(false);
    });

    it('fails closed on ingredients missing from the knowledge base', () => {
      const mystery = candidate({ additions: [{ name: 'mystery sauce' }] });
      expect(engine.isFeasible(mystery, { allergies: ['soy'] })).toBe(false);
    });

    it('passes safe candidates for allergic users', () => {
      const spinach = candidate({
        additions: [{ name: 'spinach' }],
        requiredEquipment: [],
        cookingSteps: 1,
      });
      expect(engine.isFeasible(spinach, { allergies: ['dairy', 'eggs'] })).toBe(true);
    });

    it('ignores allergy checks when none declared', () => {
      const mystery = candidate({ additions: [{ name: 'mystery sauce' }] });
      expect(engine.isFeasible(mystery, {})).toBe(true);
    });
  });

  describe('soft constraints', () => {
    it('filters by time', () => {
      expect(engine.isFeasible(candidate({ estimatedTime: 10 }), { timeMinutes: 5 })).toBe(false);
      expect(engine.isFeasible(candidate({ estimatedTime: 4 }), { timeMinutes: 5 })).toBe(true);
    });

    it('filters by budget tiers', () => {
      expect(engine.isFeasible(candidate({ estimatedCost: 'low' }), { budget: 'low' })).toBe(true);
      expect(engine.isFeasible(candidate({ estimatedCost: 'medium' }), { budget: 'low' })).toBe(
        false,
      );
      expect(engine.isFeasible(candidate({ estimatedCost: 'high' }), { budget: 'medium' })).toBe(
        false,
      );
    });

    it('filters no-cooking requests', () => {
      expect(engine.isFeasible(candidate({ cookingSteps: 2 }), { cookingRequired: false })).toBe(
        false,
      );
      expect(engine.isFeasible(candidate({ cookingSteps: 0 }), { cookingRequired: false })).toBe(
        true,
      );
    });

    it('filters by available equipment', () => {
      expect(
        engine.isFeasible(candidate({ requiredEquipment: ['pan'] }), {
          equipmentAvailable: ['toaster'],
        }),
      ).toBe(false);
      expect(
        engine.isFeasible(candidate({ requiredEquipment: [] }), { equipmentAvailable: [] }),
      ).toBe(true);
    });

    it('filters avoided ingredients in additions and replacements', () => {
      expect(
        engine.isFeasible(candidate({ additions: [{ name: 'egg' }] }), {
          avoidIngredients: ['egg'],
        }),
      ).toBe(false);
      const sub = candidate({
        additions: [],
        substitutions: [{ original: { name: 'egg' }, replacement: { name: 'firm tofu' } }],
      });
      expect(engine.isFeasible(sub, { avoidIngredients: ['firm tofu'] })).toBe(false);
    });

    it('filters dietary restrictions via the knowledge base', () => {
      expect(
        engine.isFeasible(candidate({ additions: [{ name: 'rotisserie chicken' }] }), {
          dietaryRestrictions: ['vegetarian'],
        }),
      ).toBe(false);
      expect(
        engine.isFeasible(candidate({ additions: [{ name: 'firm tofu' }] }), {
          dietaryRestrictions: ['vegan'],
        }),
      ).toBe(true);
    });
  });

  describe('filterCandidates ordering', () => {
    it('sorts pantry-available candidates first and never mutates input', () => {
      const egg = candidate({ id: randomUUID(), additions: [{ name: 'egg' }] });
      const tuna = candidate({
        id: randomUUID(),
        additions: [{ name: 'canned tuna' }],
        preferenceAlignment: 0.5, // same base score - pantry availability breaks the tie
      });
      const result = engine.filterCandidates([egg, tuna], {}, ['egg']);
      expect(result[0]!.id).toBe(egg.id);
      expect(result[0]!.preferenceAlignment).toBeGreaterThan(tuna.preferenceAlignment);
    });
  });

  describe('normalizeAllergens', () => {
    it('maps colloquial allergy names onto canonical keys', () => {
      expect(normalizeAllergens(['Peanut', 'MILK', 'seafood'])).toEqual([
        'peanuts',
        'dairy',
        'shellfish',
      ]);
    });
  });
});
