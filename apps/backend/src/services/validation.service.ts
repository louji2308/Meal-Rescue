/**
 * Validation service (implementation plan step 2.6) - the LAST gate.
 *
 * Runs after ranking, before the response leaves the server. Allergen
 * violations are CRITICAL and invalidate the recommendation outright;
 * the pipeline drops invalid candidates rather than shipping them with
 * a warning. Fail closed on safety, always.
 */
import type { Constraints, RankedRecommendation } from '@meal-rescue/shared-types';

import { findIngredient } from './ai/ingredient-db';
import type { UserPreferenceSnapshot } from './candidate-generator.service';
import { normalizeAllergens } from './constraint-engine.service';

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ severity: 'critical' | 'major' | 'minor'; code: string; message: string }>;
  warnings: ValidationWarning[];
}

export class ValidationService {
  validateRecommendation(
    recommendation: RankedRecommendation,
    constraints: Constraints,
    preferences: UserPreferenceSnapshot,
    pantry: string[],
  ): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationWarning[] = [];
    const candidate = recommendation.candidate;

    // 1. Allergen safety (CRITICAL - hard stop)
    if (constraints.allergies?.length) {
      const allergenKeys = normalizeAllergens(constraints.allergies);
      const items = [
        ...candidate.additions.map((addition) => addition.name),
        ...candidate.substitutions.map((substitution) => substitution.replacement.name),
      ];
      for (const name of items) {
        const record = findIngredient(name);
        if (!record) {
          errors.push({
            severity: 'critical',
            code: 'ALLERGEN_UNVERIFIABLE',
            message: `Ingredient "${name}" is not in the safety database`,
          });
          continue;
        }
        const hit = record.allergens.filter((allergen) => allergenKeys.includes(allergen));
        if (hit.length > 0) {
          errors.push({
            severity: 'critical',
            code: 'ALLERGEN_DETECTED',
            message: `"${name}" may contain: ${hit.join(', ')}`,
          });
        }
      }
    }

    // 2. Constraint feasibility (defense in depth - constraint engine
    // already filtered, this catches drift between stages)
    if (
      constraints.timeMinutes !== undefined &&
      candidate.estimatedTime > constraints.timeMinutes
    ) {
      errors.push({
        severity: 'major',
        code: 'CONSTRAINT_VIOLATION',
        message: `Takes ${candidate.estimatedTime} min, over your ${constraints.timeMinutes} min limit`,
      });
    }
    if (constraints.cookingRequired === false && candidate.cookingSteps > 0) {
      errors.push({
        severity: 'major',
        code: 'CONSTRAINT_VIOLATION',
        message: 'Requires cooking but you asked for no-cook options',
      });
    }

    // 3. Reasonableness (prevent absurd suggestions)
    if (candidate.additions.length > 5) {
      warnings.push({ code: 'MANY_ADDITIONS', message: 'Suggests more than five additions' });
    }
    if (candidate.estimatedTime > 60) {
      warnings.push({ code: 'LONG_TIME', message: 'Suggestion takes over an hour' });
    }

    // 4. Pantry awareness (soft warning only - never blocks)
    if (pantry.length > 0 && candidate.additions.length > 0) {
      const pantrySet = new Set(pantry.map((name) => name.toLowerCase()));
      const missing = candidate.additions
        .filter((addition) => !pantrySet.has(addition.name.toLowerCase()))
        .map((addition) => addition.name);
      if (missing.length === candidate.additions.length && candidate.additions.length > 0) {
        warnings.push({
          code: 'NOT_IN_PANTRY',
          message: `You may need to get: ${missing.join(', ')}`,
        });
      }
    }

    // 5. Preference alignment floor
    if ((preferences.avoidedFoods ?? []).length > 0 && candidate.preferenceAlignment < 0.3) {
      warnings.push({ code: 'LOW_ALIGNMENT', message: 'May not match your usual tastes' });
    }

    return {
      valid: !errors.some((error) => error.severity === 'critical'),
      errors,
      warnings,
    };
  }
}
