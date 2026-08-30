import { confidenceState } from '../src/services/meal-completion.service';

describe('behavioral override (cold-start -> observed)', () => {
  it('only promotes confirmed evidence', () => {
    expect(confidenceState(4, 0.45)).toBe('confirmed');
    expect(confidenceState(3, 0.1)).toBe('confirmed');
    expect(confidenceState(2, 0.2)).toBe('inferred');
  });
});
