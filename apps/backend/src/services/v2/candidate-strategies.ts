/**
 * V2 Candidate Strategies (plan §10, §6, §16).
 *
 * Two special candidate types augmented by the decision layer:
 *
 *  - KEEP_AS_IS ("Don't fix my food", §6): emitted when the current meal is
 *    already fine. cookingRequired=false, no additions, clear reason. This is
 *    an INTENTIONAL recommendation, not a failure.
 *
 *  - USE_EXPIRING (§16): emitted when an ingredient is flagged as nearing
 *    expiry. Prioritizes using that ingredient over generic additions.
 */
import { randomUUID } from 'node:crypto';

import type { RescueCandidate } from '@meal-rescue/shared-types';

export function buildKeepAsIsCandidate(mealFoods: string[], alignment = 0.7): RescueCandidate {
  void mealFoods;
  return {
    id: randomUUID(),
    type: 'modification',
    additions: [],
    substitutions: [],
    estimatedTime: 0,
    estimatedCost: 'low',
    requiredEquipment: [],
    cookingSteps: 0,
    nutritionalImprovement: {},
    preferenceAlignment: alignment,
    actionType: 'KEEP_AS_IS',
    estimatedMinutes: 0,
    estimatedCostLevel: 'LOW',
    cookingRequired: false,
    satisfiesIntent: true,
    satisfiesReality: true,
    nutritionRationale: {},
  };
}

export function buildUseExpiringCandidate(
  ingredient: string,
  mealFoods: string[],
  prepTime: number,
  costLevel: 'LOW' | 'MEDIUM' | 'HIGH',
): RescueCandidate {
  const budgetLevel = costLevel.toLowerCase() as 'low' | 'medium' | 'high';
  return {
    id: randomUUID(),
    type: 'addition',
    additions: [{ name: ingredient, prepTime, costLevel: budgetLevel }],
    substitutions: [],
    estimatedTime: prepTime,
    estimatedCost: budgetLevel,
    requiredEquipment: [],
    cookingSteps: prepTime > 0 && costLevel !== 'LOW' ? 1 : 0,
    nutritionalImprovement: {},
    preferenceAlignment: 0.85,
    actionType: 'USE_EXPIRING',
    estimatedMinutes: prepTime,
    estimatedCostLevel: costLevel,
    cookingRequired: false,
    satisfiesIntent: true,
    satisfiesReality: true,
    nutritionRationale: {},
  };
}
