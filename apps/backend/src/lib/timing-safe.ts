import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison for shared-secret checks.
 * Length mismatch short-circuits (lengths are not secret); equal-length
 * comparisons never leak position of the first differing byte.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
