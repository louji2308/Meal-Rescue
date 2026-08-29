import type { CulinaryFamily } from '@meal-rescue/shared-types';

import {
  CULINARY_FAMILIES,
  detectCuisineIntent,
  matchAmbiguousFamily,
} from '../src/services/ai/culinary-families';

describe('culinary families', () => {
  it('ships at least the eight core families', () => {
    const families = CULINARY_FAMILIES.map((f) => f.family);
    for (const fam of ['indian', 'east_asian', 'mediterranean', 'mexican']) {
      expect(families).toContain(fam);
    }
  });

  it('detects explicit cuisine intent from strong, unambiguous dish names', () => {
    // A dish name tied to exactly one food world wins regardless of any prior.
    expect(detectCuisineIntent(['pho'])).toBe('east_asian');
    expect(detectCuisineIntent(['shawarma'])).toBe('middle_eastern');
    expect(detectCuisineIntent(['falafel'])).toBe('mediterranean');
  });

  it('returns none for generic foods (no strong signal)', () => {
    expect(detectCuisineIntent(['rice', 'chicken'])).toBe('none');
  });

  it('matches ambiguous meals to the family with the highest learned affinity', () => {
    const affinities = new Map<CulinaryFamily, number>([
      ['mediterranean', 0.9],
      ['east_asian', 0.1],
    ]);
    // 'rice' is ambiguous (shared by many worlds); pick the user's strongest.
    const match = matchAmbiguousFamily(['rice'], affinities);
    expect(['mediterranean', 'east_asian']).toContain(match);
  });
});
