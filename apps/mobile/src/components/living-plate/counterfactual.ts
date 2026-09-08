import type { RescueCandidate, Substitution } from '@meal-rescue/shared-types';

/**
 * Counterfactual explanation engine for the Living Plate.
 *
 * Every sentence is grounded in candidate fields ONLY:
 *   - prepTime / estimatedTime (time)
 *   - cookingSteps / requiredEquipment (effort)
 *   - costLevel / estimatedCost (cost)
 *   - nutritionalImprovement / nutritionRationale (protein/fibre/healthyFat booleans)
 *
 * §7 rule: no invented nutrition facts, no calorie/macro numbers, no fake
 * precision. The copy says what *changes* (or doesn't) when the user taps
 * an addition or swap - never how "healthy" an outcome is.
 */

export interface Counterfactual {
  /** Short lead-in, e.g. "Without the egg". */
  lead: string;
  /** One grounded sentence explaining what changes. */
  body: string;
  /** Tags shown under the bubble (e.g. "5 min", "less protein support"). */
  tags: string[];
}

const REASON_KEY: Record<keyof NonNullable<RescueCandidate['nutritionRationale']>, string> = {
  protein: 'protein support',
  fibre: 'fibre support',
  healthyFat: 'healthy fats',
};

function nutritionLabels(
  rationale: NonNullable<RescueCandidate['nutritionRationale']> | undefined,
  improvement: RescueCandidate['nutritionalImprovement'],
): string[] {
  const labels: string[] = [];
  if (rationale) {
    (Object.entries(REASON_KEY) as Array<[keyof typeof REASON_KEY, string]>).forEach(
      ([key, label]) => {
        if (rationale[key]) labels.push(label);
      },
    );
  }
  if (labels.length === 0) {
    (Object.entries(improvement ?? {}) as Array<[string, string]>)
      .filter(([, direction]) => direction === 'added' || direction === 'increased')
      .forEach(([component]) => {
        const pretty = REASON_KEY[component as keyof typeof REASON_KEY];
        if (pretty) labels.push(pretty);
      });
  }
  return [...new Set(labels)];
}

function timeMinutes(
  addition: RescueCandidate['additions'][number],
  candidate: RescueCandidate,
): number | null {
  if (typeof addition.prepTime === 'number') return addition.prepTime;
  if (typeof addition.cookingSteps === 'number' && addition.cookingSteps > 0) {
    return addition.cookingSteps * 5;
  }
  if (typeof candidate.estimatedTime === 'number') return candidate.estimatedTime;
  if (typeof candidate.estimatedMinutes === 'number') return candidate.estimatedMinutes;
  return null;
}

const FRIENDLY_TAG = (minutes: number) =>
  minutes <= 5 ? 'under 5 min' : minutes <= 15 ? 'about 15 min' : `~${minutes} min`;

export function buildAdditionCounterfactual(
  addition: RescueCandidate['additions'][number],
  candidate: RescueCandidate,
): Counterfactual {
  const lead = `Without the ${addition.name.toLowerCase()}`;
  const minutes = timeMinutes(addition, candidate);
  const nutrition = nutritionLabels(candidate.nutritionRationale, candidate.nutritionalImprovement);
  const effortCost =
    addition.costLevel ?? candidate.estimatedCostLevel ?? candidate.estimatedCost ?? null;

  const parts: string[] = [];
  if (nutrition.length > 0) {
    parts.push(`less ${nutrition.join(' and ')}`);
  }
  if (minutes !== null) {
    parts.push(`saves ${FRIENDLY_TAG(minutes)}`);
  }
  if (effortCost && (effortCost === 'high' || effortCost === 'HIGH')) {
    parts.push('skips the pricier add-on');
  }

  if (parts.length === 0) {
    if (addition.state === 'raw') {
      return {
        lead,
        body: 'the meal stays plain but still quick - it just misses this boost.',
        tags: [],
      };
    }
    return { lead, body: 'the meal stays plain but still quick.', tags: [] };
  }

  const body = parts.join(', ') + '.';
  const tags = parts.slice(0, 3);
  return { lead, body, tags };
}

export function buildSubstitutionCounterfactual(
  substitution: Substitution,
  candidate: RescueCandidate,
): Counterfactual {
  const original = substitution.original.name.toLowerCase();
  const replacement = substitution.replacement.name.toLowerCase();
  const minutes =
    typeof substitution.replacement.prepTime === 'number'
      ? substitution.replacement.prepTime
      : typeof candidate.estimatedTime === 'number'
        ? candidate.estimatedTime
        : null;
  const tags: string[] = [];
  if (minutes !== null) tags.push(FRIENDLY_TAG(minutes));
  if (substitution.replacement.costLevel) {
    tags.push(`cost: ${substitution.replacement.costLevel}`);
  }
  return {
    lead: `Swap ${original} for ${replacement}`,
    body: `${replacement} stands in for ${original} - without it you keep exactly what you planned.`,
    tags,
  };
}

export function buildKeepAsIsCopy(baseFood: string): Counterfactual {
  return {
    lead: 'Leave it as is',
    body: `${baseFood} already fits what you asked for. No changes needed - you're good.`,
    tags: ['no added effort'],
  };
}

export function counterfactualForCandidate(
  candidate: RescueCandidate,
  additionIndex: number,
  baseFood: string,
): Counterfactual | null {
  if (additionIndex >= 0) {
    const addition = candidate.additions[additionIndex];
    if (addition) return buildAdditionCounterfactual(addition, candidate);
    return null;
  }
  if (additionIndex === -1 && (candidate.substitutions?.length ?? 0) > 0) {
    const substitution = candidate.substitutions[0];
    if (!substitution) return null;
    return buildSubstitutionCounterfactual(substitution, candidate);
  }
  if ((candidate.additions?.length ?? 0) === 0 && (candidate.substitutions?.length ?? 0) === 0) {
    return buildKeepAsIsCopy(baseFood);
  }
  return null;
}
