/**
 * V2 craving lock + special candidate strategies (plan §5, §7, §16).
 *
 * The craving lock is a filtering layer: candidates that REPLACE the primary
 * craving or a preserved element are dropped; flexible elements may change.
 */
import { randomUUID } from 'node:crypto';

import type { CravingProfile, RescueCandidate } from '@meal-rescue/shared-types';

import {
  buildKeepAsIsCandidate,
  buildUseExpiringCandidate,
} from '../../src/services/v2/candidate-strategies';
import { applyCravingLock } from '../../src/services/v2/craving-lock';

function substitutionCandidate(original: string, replacement: string): RescueCandidate {
  return {
    id: randomUUID(),
    type: 'substitution',
    additions: [],
    substitutions: [{ original: { name: original }, replacement: { name: replacement } }],
    estimatedTime: 3,
    estimatedCost: 'low',
    requiredEquipment: [],
    cookingSteps: 0,
    nutritionalImprovement: {},
    preferenceAlignment: 0.5,
  };
}

const noCraving = undefined;

describe('applyCravingLock', () => {
  it('passes every candidate through when no craving is supplied', () => {
    const candidates = [substitutionCandidate('instant noodles', 'soba noodles')];
    expect(applyCravingLock(candidates, noCraving)).toHaveLength(1);
  });

  it('lets a KEEP_AS_IS candidate survive any craving lock', () => {
    const keep = buildKeepAsIsCandidate([]);
    const craving: CravingProfile = {
      primary: 'instant noodles',
      preservedElements: [],
      flexibleElements: [],
    };
    expect(applyCravingLock([keep], craving)).toHaveLength(1);
  });

  it('drops a substitution that replaces the primary craving', () => {
    const craving: CravingProfile = {
      primary: 'instant noodles',
      preservedElements: [],
      flexibleElements: [],
    };
    const dna = substitutionCandidate('instant noodles', 'angel hair pasta');
    const supporters = substitutionCandidate('cabbage', 'bok choy');
    expect(applyCravingLock([dna, supporters], craving).map((c) => c.id)).toEqual([supporters.id]);
  });

  it('drops a substitution that replaces a preserved element', () => {
    const craving: CravingProfile = {
      primary: 'rice bowl',
      preservedElements: ['soft-cooked egg'],
      flexibleElements: ['nori'],
    };
    const replacesEgg = substitutionCandidate('soft-cooked egg', 'tofu');
    const swapsNori = substitutionCandidate('nori', 'sesame seeds');
    expect(applyCravingLock([replacesEgg, swapsNori], craving).map((c) => c.id)).toEqual([
      swapsNori.id,
    ]);
  });

  it('still drops a candidate whose primary is matched by a flexible element', () => {
    // The primary always wins regardless of flexibleElements listing it.
    const craving: CravingProfile = {
      primary: 'ramen',
      preservedElements: [],
      flexibleElements: ['ramen'],
    };
    const swapsRamen = substitutionCandidate('ramen', 'udon');
    expect(applyCravingLock([swapsRamen], craving)).toHaveLength(0);
  });
});

describe('candidate strategies', () => {
  it('buildKeepAsIsCandidate is a zero-effort, zero-cost modification with the KEEP_AS_IS action', () => {
    const candidate = buildKeepAsIsCandidate(['instant noodles']);
    expect(candidate.actionType).toBe('KEEP_AS_IS');
    expect(candidate.additions).toEqual([]);
    expect(candidate.substitutions).toEqual([]);
    expect(candidate.estimatedTime).toBe(0);
    expect(candidate.estimatedCost).toBe('low');
    expect(candidate.cookingSteps).toBe(0);
    expect(candidate.estimatedMinutes).toBe(0);
    expect(candidate.estimatedCostLevel).toBe('LOW');
    expect(candidate.cookingRequired).toBe(false);
    expect(candidate.satisfiesIntent).toBe(true);
    expect(candidate.satisfiesReality).toBe(true);
  });

  it('buildKeepAsIsCandidate honors an alignment boost for balanced meals', () => {
    expect(buildKeepAsIsCandidate([], 0.97).preferenceAlignment).toBe(0.97);
    expect(buildKeepAsIsCandidate([]).preferenceAlignment).toBe(0.7);
  });

  it('buildUseExpiringCandidate is a cheap single-addition rescue for an expiring ingredient', () => {
    const candidate = buildUseExpiringCandidate('spinach', ['instant noodles'], 5, 'LOW');
    expect(candidate.type).toBe('addition');
    expect(candidate.additions).toEqual([{ name: 'spinach', prepTime: 5, costLevel: 'low' }]);
    expect(candidate.estimatedTime).toBe(5);
    expect(candidate.estimatedCostLevel).toBe('LOW');
    expect(candidate.cookingSteps).toBe(0);
  });
});
