import type { Constraints, DetectedFood, DetectedIngredient } from '@meal-rescue/shared-types';

import { CandidateGeneratorService } from '../src/services/candidate-generator.service';

function food(name: string): DetectedFood {
  return { name, confidence: 0.9 };
}
function ingredient(name: string): DetectedIngredient {
  return { name, confidence: 0.9, state: 'cooked' };
}

describe('candidate generator culture-aware', () => {
  const generator = new CandidateGeneratorService();
  const emptyConstraints: Constraints = {};

  it('suggests in an explicit cuisine for a clearly-marked meal regardless of prior', () => {
    // Prior points at one food world, but the dish name unambiguously belongs
    // to another -> the dish wins. Principle is country-agnostic.
    const foods = [food('pho')];
    const culture = {
      affinities: new Map([['middle_eastern' as const, 0.9]]),
      traditionVsModern: -0.6,
    };
    const candidates = generator.generateCandidates(
      foods,
      [ingredient('pho')],
      { protein: false, fiber_sources: false },
      emptyConstraints,
      {},
      [],
      culture,
    );
    const names = candidates.flatMap((c) => [
      ...c.additions.map((a) => a.name),
      ...c.substitutions.map((s) => s.replacement.name),
    ]);
    // east_asian traditional anchor / modernTwists reference edamame/tofu/soy etc.
    expect(names.some((n) => /edamame|tofu|soy/.test(n))).toBe(true);
  });
});
