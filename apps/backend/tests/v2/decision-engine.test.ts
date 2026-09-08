/**
 * V2 decision engine (plan §4, §9, §10).
 *
 * Coverage:
 *  - shapeForIntent: LIGHTEN trims >20min cookers, NO_COOK trims every
 *    candidate that requires cooking, PRESERVE trims heavy substitutions.
 *  - decorateCandidate: V2 metadata + boolean-only nutrition rationale;
 *    KEEP_AS_IS zeroes out effort/cost/equipment.
 *  - pickWinnerAction: the ranked top candidate's action decides.
 *  - classifyAction: deterministic action classification (pipeline export).
 */
import { randomUUID } from 'node:crypto';

import type { MealIntent, RankedRecommendation, RescueCandidate } from '@meal-rescue/shared-types';

import { classifyAction } from '../../src/services/rescue-pipeline.service';
import {
  DECISION_ACTION_ORDER,
  decorateCandidate,
  pickWinnerAction,
  shapeForIntent,
} from '../../src/services/v2/decision-engine.service';

function candidate(
  overrides: Partial<RescueCandidate> & { additions?: RescueCandidate['additions'] } = {},
): RescueCandidate {
  return {
    id: randomUUID(),
    type: 'addition',
    additions: [{ name: 'egg', prepTime: 5 }],
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

const ctx = {
  intent: 'DECIDE' as MealIntent,
  preferAvailableIngredients: false,
  cleanupEffortCeiling: null,
  expiringIngredients: [],
  mealFoods: ['instant noodles'],
  mealDetectedComponents: { protein: false },
};

describe('shapeForIntent', () => {
  it('keeps everything for DECIDE (permissive)', () => {
    const cook = candidate({ estimatedTime: 40, cookingSteps: 6 });
    const quick = candidate({ estimatedTime: 5, cookingSteps: 0 });
    expect(shapeForIntent([cook, quick], 'DECIDE', ctx)).toHaveLength(2);
  });

  it('keeps everything for SATISFY', () => {
    const cook = candidate({ estimatedTime: 40, cookingSteps: 6 });
    expect(shapeForIntent([cook], 'SATISFY', ctx)).toHaveLength(1);
  });

  it('LIGHTEN drops slow cookers but keeps short / no-cook options', () => {
    const slow = candidate({ estimatedTime: 25, cookingSteps: 4 });
    const quick = candidate({ estimatedTime: 10, cookingSteps: 1 });
    const noCook = candidate({ estimatedTime: 30, cookingSteps: 0 });
    const kept = shapeForIntent([slow, quick, noCook], 'LIGHTEN', ctx);
    expect(kept.map((c) => c.id)).toEqual([quick.id, noCook.id]);
  });

  it('NO_COOK drops anything with cooking steps', () => {
    const cooked = candidate({ cookingSteps: 2 });
    const noCook = candidate({ cookingSteps: 0 });
    expect(shapeForIntent([cooked, noCook], 'NO_COOK', ctx)).toEqual([noCook]);
  });

  it('PRESERVE keeps only substitutions that are quick enough', () => {
    const heavy = candidate({
      substitutions: [{ original: { name: 'noodles' }, replacement: { name: 'soba' } }],
      estimatedTime: 40,
    });
    const light = candidate({
      substitutions: [{ original: { name: 'noodles' }, replacement: { name: 'soba' } }],
      estimatedTime: 20,
    });
    const pure = candidate({ estimatedTime: 5 });
    const kept = shapeForIntent([heavy, light, pure], 'PRESERVE', ctx);
    expect(kept.map((c) => c.id)).toEqual([light.id, pure.id]);
  });

  it('preferAvailableIngredients soft-sorts by preferenceAlignment', () => {
    const low = candidate({ preferenceAlignment: 0.2 });
    const high = candidate({ preferenceAlignment: 0.9 });
    const shaped = shapeForIntent([low, high], 'DECIDE', {
      ...ctx,
      preferAvailableIngredients: true,
    });
    expect(shaped[0]!.id).toBe(high.id);
  });
});

describe('decorateCandidate', () => {
  it('fills the V2 metadata surface', () => {
    const raw = candidate();
    const decorated = decorateCandidate(raw, 'SATISFY', true, 'ADD');
    expect(decorated.actionType).toBe('ADD');
    expect(decorated.estimatedMinutes).toBe(5);
    expect(decorated.estimatedCostLevel).toBe('LOW');
    expect(decorated.cookingRequired).toBe(false);
    expect(decorated.satisfiesIntent).toBe(true);
    expect(decorated.satisfiesReality).toBe(true);
  });

  it('marks nutrition rationale as booleans, never scores', () => {
    const egg = decorateCandidate(
      candidate({ additions: [{ name: 'egg' }] }),
      'DECIDE',
      true,
      'ADD',
    );
    expect(egg.nutritionRationale).toEqual({ protein: true, fibre: false, healthyFat: false });

    const spinach = decorateCandidate(
      candidate({ additions: [{ name: 'spinach' }] }),
      'DECIDE',
      true,
      'ADD',
    );
    expect(spinach.nutritionRationale).toEqual({ protein: false, fibre: true, healthyFat: false });
  });

  it('recognizes a healthy-fat addition', () => {
    const avocado = decorateCandidate(
      candidate({ additions: [{ name: 'avocado' }] }),
      'DECIDE',
      true,
      'ADD',
    );
    expect(avocado.nutritionRationale?.healthyFat).toBe(true);
  });

  it('KEEP_AS_IS zeroes effort, cost, and equipment', () => {
    const keep = decorateCandidate(
      candidate({
        additions: [{ name: 'egg' }],
        estimatedTime: 12,
        cookingSteps: 3,
        requiredEquipment: ['pan'],
        estimatedCost: 'medium',
      }),
      'PRESERVE',
      true,
      'KEEP_AS_IS',
    );
    expect(keep.additions).toEqual([]);
    expect(keep.substitutions).toEqual([]);
    expect(keep.estimatedTime).toBe(0);
    expect(keep.estimatedMinutes).toBe(0);
    expect(keep.cookingSteps).toBe(0);
    expect(keep.cookingRequired).toBe(false);
    expect(keep.estimatedCost).toBe('low');
    expect(keep.estimatedCostLevel).toBe('LOW');
    expect(keep.requiredEquipment).toEqual([]);
  });
});

describe('pickWinnerAction', () => {
  it('returns KEEP_AS_IS for an empty ranking', () => {
    expect(pickWinnerAction([])).toBe('KEEP_AS_IS');
  });

  it('returns the top candidate action', () => {
    const ranked: RankedRecommendation[] = [
      {
        candidate: decorateCandidate(candidate(), 'DECIDE', true, 'USE_LEFTOVER'),
        rankScore: 0.9,
        reasoning: '',
        naturalLanguageExplanation: '',
      },
    ];
    expect(pickWinnerAction(ranked)).toBe('USE_LEFTOVER');
  });
});

describe('classifyAction', () => {
  const foods = [{ name: 'instant noodles', confidence: 0.9 }];

  it('returns KEEP_AS_IS when there are no additions', () => {
    expect(classifyAction(candidate({ additions: [] }), [], foods)).toBe('KEEP_AS_IS');
  });

  it('returns RESCUE when there are substitutions', () => {
    expect(
      classifyAction(
        candidate({
          substitutions: [{ original: { name: 'noodles' }, replacement: { name: 'soba' } }],
        }),
        [],
        foods,
      ),
    ).toBe('RESCUE');
  });

  it('returns USE_EXPIRING when the addition is the expiring ingredient', () => {
    expect(
      classifyAction(candidate({ additions: [{ name: 'spinach' }] }), ['Spinach'], foods),
    ).toBe('USE_EXPIRING');
  });

  it('returns USE_LEFTOVER when the addition is already part of the meal', () => {
    expect(classifyAction(candidate({ additions: [{ name: 'instant noodles' }] }), [], foods)).toBe(
      'USE_LEFTOVER',
    );
  });

  it('returns COMBINE for multiple additions and ADD for a single fresh one', () => {
    const two = candidate({ additions: [{ name: 'egg' }, { name: 'spinach' }] });
    expect(classifyAction(two, [], foods)).toBe('COMBINE');
    expect(classifyAction(candidate(), [], foods)).toBe('ADD');
  });
});

describe('DECISION_ACTION_ORDER', () => {
  it('covers exactly the six frozen decision actions in order', () => {
    expect(DECISION_ACTION_ORDER).toEqual([
      'RESCUE',
      'ADD',
      'COMBINE',
      'USE_LEFTOVER',
      'USE_EXPIRING',
      'KEEP_AS_IS',
    ]);
  });
});
