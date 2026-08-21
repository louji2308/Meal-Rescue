/**
 * Constraint engine - deterministic filtering BEFORE any LLM sees a
 * candidate (architecture doc: "Deterministic constraint engine" stage).
 *
 * Allergies are a HARD filter backed by the ingredient knowledge base's
 * allergen graph (more reliable than substring matching). Everything else
 * is also deterministic: time, budget, cooking, equipment, avoided
 * ingredients, dietary restrictions.
 */
import type { Constraints, DietaryRestriction, RescueCandidate } from '@meal-rescue/shared-types';

import { type AllergenKey, findIngredient } from './ai/ingredient-db';

export class ConstraintEngineService {
  /**
   * Returns candidates satisfying every hard constraint, scored by pantry
   * compatibility and sorted best-first.
   */
  filterCandidates(
    candidates: RescueCandidate[],
    constraints: Constraints,
    userPantry: string[],
  ): RescueCandidate[] {
    let filtered = candidates.filter((candidate) => this.isFeasible(candidate, constraints));

    if (userPantry.length > 0) {
      const pantry = new Set(userPantry.map((name) => name.toLowerCase()));
      filtered = filtered
        .map((candidate) => ({
          ...candidate,
          preferenceAlignment: clamp01(
            candidate.preferenceAlignment + this.pantryBonus(candidate, pantry),
          ),
        }))
        .sort((a, b) => b.preferenceAlignment - a.preferenceAlignment);
    }

    return filtered;
  }

  /** True when candidate violates NO hard constraint. */
  isFeasible(candidate: RescueCandidate, constraints: Constraints): boolean {
    if (
      constraints.timeMinutes !== undefined &&
      candidate.estimatedTime > constraints.timeMinutes
    ) {
      return false;
    }

    if (constraints.budget === 'low' && candidate.estimatedCost !== 'low') return false;
    if (constraints.budget === 'medium' && candidate.estimatedCost === 'high') return false;

    if (constraints.cookingRequired === false && candidate.cookingSteps > 0) return false;

    if (
      constraints.equipmentAvailable &&
      !candidate.requiredEquipment.every((equipment) =>
        constraints.equipmentAvailable!.includes(equipment),
      )
    ) {
      return false;
    }

    if (constraints.allergies?.length && this.violatesAllergies(candidate, constraints.allergies)) {
      return false;
    }

    if (constraints.avoidIngredients?.length) {
      const avoid = new Set(constraints.avoidIngredients.map((name) => name.toLowerCase()));
      const touchesAvoided =
        candidate.additions.some((addition) => avoid.has(addition.name.toLowerCase())) ||
        candidate.substitutions.some((substitution) =>
          avoid.has(substitution.replacement.name.toLowerCase()),
        );
      if (touchesAvoided) return false;
    }

    if (constraints.dietaryRestrictions?.length) {
      for (const restriction of constraints.dietaryRestrictions) {
        if (!this.satisfiesDiet(candidate, restriction)) return false;
      }
    }

    return true;
  }

  private violatesAllergies(candidate: RescueCandidate, allergies: string[]): boolean {
    const allergenKeys = normalizeAllergens(allergies);
    if (allergenKeys.length === 0) return false;

    const items = [
      ...candidate.additions.map((addition) => addition.name),
      ...candidate.substitutions.map((substitution) => substitution.replacement.name),
    ];

    return items.some((name) => {
      const record = findIngredient(name);
      // Unknown ingredients are treated as unsafe when allergies exist -
      // fail closed on safety, never open.
      if (!record) return true;
      return record.allergens.some((allergen) => allergenKeys.includes(allergen));
    });
  }

  private satisfiesDiet(candidate: RescueCandidate, restriction: DietaryRestriction): boolean {
    const items = [
      ...candidate.additions.map((addition) => addition.name),
      ...candidate.substitutions.map((substitution) => substitution.replacement.name),
    ];
    return items.every((name) => {
      const record = findIngredient(name);
      if (!record) return true; // diet checks stay permissive; validation re-checks
      return !record.excludesDiets.includes(restriction);
    });
  }

  /** Fraction of additions already in the user's pantry. */
  private pantryBonus(candidate: RescueCandidate, pantry: Set<string>): number {
    if (candidate.additions.length === 0) return 0;
    const inPantry = candidate.additions.filter((addition) =>
      pantry.has(addition.name.toLowerCase()),
    ).length;
    return inPantry / candidate.additions.length / 10; // gentle nudge, max +0.1
  }
}

const ALLERGEN_ALIASES: Record<string, AllergenKey> = {
  peanut: 'peanuts',
  peanuts: 'peanuts',
  'tree nuts': 'tree_nuts',
  tree_nuts: 'tree_nuts',
  nuts: 'tree_nuts',
  dairy: 'dairy',
  milk: 'dairy',
  lactose: 'dairy',
  egg: 'eggs',
  eggs: 'eggs',
  gluten: 'gluten',
  wheat: 'gluten',
  soy: 'soy',
  soya: 'soy',
  fish: 'fish',
  shellfish: 'shellfish',
  seafood: 'shellfish',
};

export function normalizeAllergens(allergies: string[]): AllergenKey[] {
  const keys = new Set<AllergenKey>();
  for (const allergy of allergies) {
    const key = ALLERGEN_ALIASES[allergy.trim().toLowerCase()];
    if (key) keys.add(key);
  }
  return [...keys];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
