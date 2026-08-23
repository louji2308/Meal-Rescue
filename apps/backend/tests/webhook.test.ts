import { timingSafeEqualStr } from '../src/lib/timing-safe';

describe('timingSafeEqualStr', () => {
  it('matches equal strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings of equal length', () => {
    expect(timingSafeEqualStr('abc123', 'xyz789')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(timingSafeEqualStr('a', 'ab')).toBe(false);
  });
});
