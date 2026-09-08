/**
 * V2 intent resolver + reality context (plan §5, §8).
 *
 * Reality is a HARD constraint: timeAvailable caps the prep time, cooking
 * is disabled when not allowed, and budget only ever TIGHTENS - it never
 * loosens a stricter existing constraint.
 */
import type { Constraints } from '@meal-rescue/shared-types';

import {
  INTENT_ORDER,
  intentIsNarrowing,
  resolveIntent,
} from '../../src/services/v2/intent-resolver';
import { deriveReality } from '../../src/services/v2/reality-context';

describe('resolveIntent', () => {
  it('defaults to DECIDE when absent', () => {
    expect(resolveIntent(undefined)).toBe('DECIDE');
  });

  it('passes through a valid intent as-is', () => {
    for (const intent of INTENT_ORDER) {
      expect(resolveIntent(intent)).toBe(intent);
    }
  });

  it('maps only narrowing intents as narrowing', () => {
    for (const intent of INTENT_ORDER) {
      expect(intentIsNarrowing(intent)).toBe(intent === 'LIGHTEN' || intent === 'NO_COOK');
    }
  });
});

describe('deriveReality', () => {
  it('passes constraints through unchanged when reality is absent (permissive)', () => {
    const constraints: Constraints = { timeMinutes: 10, cookingRequired: true };
    const out = deriveReality(constraints, undefined);
    expect(out.constraints).toEqual(constraints);
    expect(out.noCooking).toBe(false);
    expect(out.preferAvailableIngredients).toBe(false);
    expect(out.cleanupEffortCeiling).toBeNull();
  });

  it('caps the prep time to the reality budget (rotates to the tighter value)', () => {
    const out = deriveReality({ timeMinutes: 60 }, {
      timeAvailable: 15,
      cookingAllowed: true,
      useAvailableIngredients: false,
    } as const);
    expect(out.constraints.timeMinutes).toBe(15);
  });

  it('never loosens an existing tighter time cap', () => {
    const out = deriveReality({ timeMinutes: 10 }, {
      timeAvailable: 30,
      cookingAllowed: true,
      useAvailableIngredients: false,
    } as const);
    expect(out.constraints.timeMinutes).toBe(10);
  });

  it('disables cooking when cookingAllowed is false', () => {
    const out = deriveReality({ cookingRequired: true }, {
      timeAvailable: 30,
      cookingAllowed: false,
      useAvailableIngredients: false,
    } as const);
    expect(out.constraints.cookingRequired).toBe(false);
    expect(out.noCooking).toBe(true);
  });

  it('keeps cooking enabled when allowed and not otherwise constrained', () => {
    const out = deriveReality({}, {
      timeAvailable: 30,
      cookingAllowed: true,
      useAvailableIngredients: true,
    } as const);
    expect(out.constraints.cookingRequired).toBeUndefined();
    expect(out.noCooking).toBe(false);
    expect(out.preferAvailableIngredients).toBe(true);
  });

  it('maps budgetLevel LOW/MEDIUM down to the cost cap without loosening', () => {
    const low = deriveReality({}, {
      timeAvailable: 15,
      cookingAllowed: true,
      budgetLevel: 'LOW',
      useAvailableIngredients: false,
    } as const);
    expect(low.constraints.budget).toBe('low');

    const medium = deriveReality({ budget: 'low' }, {
      timeAvailable: 15,
      cookingAllowed: true,
      budgetLevel: 'MEDIUM',
      useAvailableIngredients: false,
    } as const);
    // Existing low cap must win over the looser reality MEDIUM.
    expect(medium.constraints.budget).toBe('low');
  });

  it('maps cleanupTolerance LOW/MEDIUM to an effort ceiling and HIGH to none', () => {
    const lowCeiling = deriveReality({}, {
      timeAvailable: 30,
      cookingAllowed: true,
      useAvailableIngredients: false,
      cleanupTolerance: 'LOW',
    } as const);
    expect(lowCeiling.cleanupEffortCeiling).toBe(1);

    const mediumCeiling = deriveReality({}, {
      timeAvailable: 30,
      cookingAllowed: true,
      useAvailableIngredients: false,
      cleanupTolerance: 'MEDIUM',
    } as const);
    expect(mediumCeiling.cleanupEffortCeiling).toBe(3);

    const high = deriveReality({}, {
      timeAvailable: 30,
      cookingAllowed: true,
      useAvailableIngredients: false,
      cleanupTolerance: 'HIGH',
    } as const);
    expect(high.cleanupEffortCeiling).toBeNull();
  });

  it('leaves the caller time cap alone when reality omits timeAvailable', () => {
    const out = deriveReality({ timeMinutes: 20 }, {
      cookingAllowed: true,
      useAvailableIngredients: false,
    } as const);
    expect(out.constraints.timeMinutes).toBe(20);
  });
});
