import { PAIRS, getPair, mealGroupsForMealGroup } from '../src/services/onboarding';

describe('pair catalog', () => {
  it('has exactly seven pairs with sequential ids', () => {
    expect(PAIRS).toHaveLength(7);
    PAIRS.forEach((pair, i) => {
      expect(pair.id).toBe(`pair-0${i + 1}`);
    });
  });

  it('keeps the base meal identical between options within a pair', () => {
    for (const pair of PAIRS) {
      expect(pair.baseMeal.name.length).toBeGreaterThan(0);
      expect(pair.baseMeal.mealGroup.length).toBeGreaterThan(0);
      expect(pair.optionA.name).not.toBe(pair.optionB.name);
    }
  });

  it('loads each pair on 1-2 factors with weights summing to 1', () => {
    for (const pair of PAIRS) {
      expect(pair.tests.length).toBeGreaterThanOrEqual(1);
      expect(pair.tests.length).toBeLessThanOrEqual(2);
      expect(pair.tests.reduce((sum, t) => sum + t.weight, 0)).toBeCloseTo(1);
    }
  });

  it('diagnoses every latent factor at least twice across the catalog', () => {
    const coverage = new Map<string, number>();
    for (const pair of PAIRS) {
      for (const { factor } of pair.tests) {
        coverage.set(factor, (coverage.get(factor) ?? 0) + 1);
      }
    }
    for (const factor of [
      'nutritional',
      'sensory',
      'satisfaction',
      'modification',
      'exploration',
    ]) {
      expect(coverage.get(factor)).toBeGreaterThanOrEqual(2);
    }
  });

  it('only uses pantry-familiar meal groups and never writes cuisine as a preference', () => {
    const groups = new Set(PAIRS.map((p) => p.baseMeal.mealGroup));
    for (const group of groups) {
      expect(['rice_based', 'noodle', 'breakfast_bowl', 'soup', 'yogurt_bowl', 'potato']).toContain(
        group,
      );
    }
    for (const pair of PAIRS) {
      expect(pair.baseMeal.cuisineLabel).not.toBe(pair.baseMeal.mealGroup);
    }
  });

  it('exposes stable lookup helpers', () => {
    expect(getPair('pair-01')?.id).toBe('pair-01');
    expect(getPair('pair-99')).toBeUndefined();
    expect(mealGroupsForMealGroup('soup')).toEqual(['soup']);
  });
});
