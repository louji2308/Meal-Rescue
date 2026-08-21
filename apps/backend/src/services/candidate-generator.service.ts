/**
 * Candidate generator (implementation plan step 2.4).
 *
 * Four strategies, in priority order:
 *   1. Component additions  - fill the meal's missing nutritional gaps
 *   2. Cuisine enhancements - pattern-based flavor-compatible boosts
 *   3. Minimal substitutions - only for ingredients the user avoids
 *   4. Favorites            - user's preferred additions if compatible
 *
 * Output is DIVERSE INPUT for the funnel - the constraint engine and
 * ranking layer decide what survives. Product rule: candidates stay small
 * (one or two ingredients), never recipe-sized.
 */
import { randomUUID } from 'node:crypto';

import type {
  ComponentKey,
  Constraints,
  DetectedFood,
  DetectedIngredient,
  RescueCandidate,
} from '@meal-rescue/shared-types';

import {
  CUISINE_PATTERNS,
  type IngredientRecord,
  findBestMatch,
  findByComponent,
  findIngredient,
} from './ai/ingredient-db';

export interface UserPreferenceSnapshot {
  favoriteFoods?: string[];
  avoidedFoods?: string[];
}

const MAX_CANDIDATES = 12;
const TOP_PER_COMPONENT = 3;

export class CandidateGeneratorService {
  generateCandidates(
    detectedFoods: DetectedFood[],
    detectedIngredients: DetectedIngredient[],
    detectedComponents: Record<string, boolean>,
    constraints: Constraints,
    preferences: UserPreferenceSnapshot,
    pantry: string[],
  ): RescueCandidate[] {
    const candidates: RescueCandidate[] = [
      ...this.componentAdditions(detectedComponents, constraints),
      ...this.cuisineEnhancements(detectedFoods, constraints),
      ...this.minimalSubstitutions(detectedIngredients, preferences),
      ...this.favoriteAdditions(preferences, detectedFoods, pantry),
    ];

    return dedupeByIdentity(candidates).slice(0, MAX_CANDIDATES);
  }

  private componentAdditions(
    components: Record<string, boolean>,
    constraints: Constraints,
  ): RescueCandidate[] {
    const missing: ComponentKey[] = [];
    if (!components.protein) missing.push('protein');
    if (!components.fiber_sources) missing.push('fiber_sources');
    if (!components.healthy_fat_sources) missing.push('healthy_fat_sources');

    const noCooking = constraints.cookingRequired === false;

    const candidates: RescueCandidate[] = [];
    for (const component of missing) {
      let options = findByComponent(component);

      if (noCooking) options = options.filter((record) => record.cookingSteps === 0);
      if (constraints.budget === 'low') {
        options = options.filter((record) => record.costLevel === 'low');
      }

      for (const option of options.slice(0, TOP_PER_COMPONENT)) {
        candidates.push(this.fromRecord(option, [component], 0.5));
      }
    }
    return candidates;
  }

  private cuisineEnhancements(
    detectedFoods: DetectedFood[],
    constraints: Constraints,
  ): RescueCandidate[] {
    const foodNames = detectedFoods.map((food) => food.name.toLowerCase()).join(' ');
    const pattern = CUISINE_PATTERNS.find((entry) =>
      entry.keywords.some((keyword) => foodNames.includes(keyword)),
    );
    if (!pattern) return [];

    const maxTime = constraints.timeMinutes ?? 30;
    const noCooking = constraints.cookingRequired === false;
    const records = pattern.additions
      .map((name) => findIngredient(name))
      .filter((record): record is IngredientRecord => record !== null)
      .filter((record) => record.prepTimeMinutes <= maxTime)
      .filter((record) => !noCooking || record.cookingSteps === 0);

    // One candidate per pattern addition keeps choices digestible.
    return records.map((record) =>
      this.fromRecord(record, record.components, 0.55, pattern.nutritionalImpact),
    );
  }

  private minimalSubstitutions(
    detectedIngredients: DetectedIngredient[],
    preferences: UserPreferenceSnapshot,
  ): RescueCandidate[] {
    const avoided = preferences.avoidedFoods ?? [];
    if (avoided.length === 0) return [];

    const candidates: RescueCandidate[] = [];
    for (const ingredient of detectedIngredients) {
      const isAvoided = avoided.some((term) =>
        ingredient.name.toLowerCase().includes(term.toLowerCase()),
      );
      if (!isAvoided) continue;

      const record = findBestMatch(ingredient.name);
      const substituteNames = record?.substitutes ?? [];
      for (const substituteName of substituteNames.slice(0, 2)) {
        const substitute = findIngredient(substituteName);
        if (!substitute) continue;
        candidates.push({
          id: randomUUID(),
          type: 'substitution',
          additions: [],
          substitutions: [
            {
              original: { name: ingredient.name },
              replacement: {
                name: substitute.name,
                prepTime: substitute.prepTimeMinutes,
                costLevel: substitute.costLevel,
              },
            },
          ],
          estimatedTime: substitute.prepTimeMinutes,
          estimatedCost: substitute.costLevel,
          requiredEquipment: substitute.requiredEquipment,
          cookingSteps: substitute.cookingSteps,
          nutritionalImprovement: toImpact(substitute.components),
          preferenceAlignment: 0.8,
        });
      }
    }
    return candidates;
  }

  private favoriteAdditions(
    preferences: UserPreferenceSnapshot,
    detectedFoods: DetectedFood[],
    pantry: string[],
  ): RescueCandidate[] {
    const favorites = preferences.favoriteFoods ?? [];
    if (favorites.length === 0) return [];

    const foodNames = detectedFoods.map((food) => food.name.toLowerCase());
    const pantrySet = new Set(pantry.map((name) => name.toLowerCase()));

    const candidates: RescueCandidate[] = [];
    for (const favorite of favorites.slice(0, 5)) {
      const record = findBestMatch(favorite);
      if (!record) continue;
      // Compatibility heuristic: skip if it IS the meal already.
      if (foodNames.some((food) => food.includes(record.name) || record.name.includes(food))) {
        continue;
      }
      const inPantry = pantrySet.has(record.name);
      candidates.push(this.fromRecord(record, record.components, inPantry ? 0.9 : 0.7));
    }
    return candidates;
  }

  private fromRecord(
    record: IngredientRecord,
    components: ComponentKey[],
    preferenceAlignment: number,
    impactOverride?: Record<string, 'added' | 'increased'>,
  ): RescueCandidate {
    return {
      id: randomUUID(),
      type: 'addition',
      additions: [
        {
          name: record.name,
          state: record.state,
          prepTime: record.prepTimeMinutes,
          costLevel: record.costLevel,
          requiredEquipment: record.requiredEquipment,
          cookingSteps: record.cookingSteps,
        },
      ],
      substitutions: [],
      estimatedTime: record.prepTimeMinutes,
      estimatedCost: record.costLevel,
      requiredEquipment: record.requiredEquipment,
      cookingSteps: record.cookingSteps,
      nutritionalImprovement:
        impactOverride ??
        Object.fromEntries(components.map((component) => [component, 'added' as const])),
      preferenceAlignment,
    };
  }
}

/** Same action on the same ingredients = same candidate, keep one. */
function dedupeByIdentity(candidates: RescueCandidate[]): RescueCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const identity = JSON.stringify([
      candidate.type,
      candidate.additions.map((addition) => addition.name).sort(),
      candidate.substitutions.map((substitution) => substitution.replacement.name).sort(),
    ]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function toImpact(components: ComponentKey[]): Record<string, 'added'> {
  return Object.fromEntries(components.map((component) => [component, 'added' as const]));
}
