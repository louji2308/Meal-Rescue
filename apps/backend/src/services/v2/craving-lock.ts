/**
 * V2 Craving Lock (plan §5 / §7).
 *
 * The user can lock the main craving (primary) plus preserved elements they
 * don't want swapped. Flexible elements may change. The engine must modify
 * AROUND the craving - supportive modification, never replacement.
 *
 * This module is a filtering layer applied after candidate generation:
 *   - Drop any candidate whose substitution REPLACES the primary craving or any
 *     preserved element.
 *   - Allow flexibleElements to be changed freely.
 *   - A KEEP_AS_IS candidate always survives a craving lock (it preserves
 *     everything by definition).
 */
import type { CravingProfile, RescueCandidate } from '@meal-rescue/shared-types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns candidates that respect the craving lock. When no craving is
 * supplied all candidates pass.
 */
export function applyCravingLock(
  candidates: RescueCandidate[],
  craving: CravingProfile | undefined,
): RescueCandidate[] {
  if (!craving) return candidates;

  const primary = normalize(craving.primary);
  const preserved = new Set(craving.preservedElements.map(normalize).filter(Boolean));

  return candidates.filter((candidate) => {
    // A keep-as-is never replaces anything.
    if (candidate.actionType === 'KEEP_AS_IS') return true;

    // Substitutions are the only thing that can *replace* an existing element.
    for (const substitution of candidate.substitutions) {
      const original = normalize(substitution.original.name);
      // Replacing the primary craving is forbidden by design.
      if (
        primary !== '' &&
        (original === primary || original.includes(primary) || primary.includes(original))
      ) {
        return false;
      }
      // Preserved elements must not be swapped either.
      if (preserved.has(original)) return false;
    }

    return true;
  });
}
