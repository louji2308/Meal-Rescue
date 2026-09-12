import type { DietaryRestriction, UUID } from '@meal-rescue/shared-types';

import type { AllergenKey } from '../ai/ingredient-db';
import { findBestMatch } from '../ai/ingredient-db';
import { normalizeAllergens } from '../constraint-engine.service';

/**
 * A member's resolved taste context handed to the convergence engine.
 * `learned` maps canonical ingredient name -> affinity (-1..1).
 */
export interface MemberTasteContext {
  memberId: UUID;
  displayName: string;
  initials: string;
  relationship: string;
  allergies: string[];
  allergyKeys: AllergenKey[];
  dietaryRestrictions: DietaryRestriction[];
  avoidIngredients: string[];
  likes: string[];
  dislikes: string[];
  spiceLevel?: 'mild' | 'medium' | 'spicy';
  textures: string[];
  learned: Record<string, number>;
}

export interface BlockedIngredient {
  ingredient: string;
  reasons: string[];
}

export interface SharedSafetyResult {
  safe: string[];
  blocked: BlockedIngredient[];
}

/**
 * HouseholdConstraintService — deterministic HARD safety.
 *
 * HARD constraints (allergies, dietary restrictions, explicit avoid list) are
 * always evaluated here, before any scoring or LLM. Unknown ingredients are
 * treated as UNSAFE when the member declares any allergy (fail closed),
 * mirroring ConstraintEngineService.
 */
export class HouseholdConstraintService {
  /** Returns a human-readable violation reason, or null when safe. */
  checkIngredient(rawName: string, member: MemberTasteContext): string | null {
    const name = rawName.trim().toLowerCase();
    if (!name) return null;

    if (member.avoidIngredients.some((avoid) => avoid.trim().toLowerCase() === name)) {
      return `avoided by ${member.displayName}`;
    }

    const record = findBestMatch(name);

    // Explicit avoid list may also be expressed via an alias of a known record.
    if (record) {
      const avoidsRecord = member.avoidIngredients.some(
        (avoid) => findBestMatch(avoid)?.name === record.name,
      );
      if (avoidsRecord) return `avoided by ${member.displayName}`;
    }

    if (member.allergyKeys.length > 0) {
      if (!record) {
        // Fail closed: an unknown ingredient cannot be proven safe.
        return `unverified for ${member.displayName}'s allergies`;
      }
      const hit = record.allergens.find((allergen) => member.allergyKeys.includes(allergen));
      if (hit) return `contains ${hit.replace('_', ' ')} (allergy: ${member.displayName})`;
    }

    if (member.dietaryRestrictions.length > 0) {
      if (record) {
        const hit = record.excludesDiets.find((diet) => member.dietaryRestrictions.includes(diet));
        if (hit) return `not ${hit} (${member.displayName})`;
      }
    }

    return null;
  }

  /** True when every ingredient in the list is safe for this one member. */
  ingredientsSafeForMember(names: string[], member: MemberTasteContext): boolean {
    return names.every((name) => this.checkIngredient(name, member) === null);
  }

  /**
   * Returns ingredients safe for ALL members (safe to share) plus the blocked
   * ones with per-member reasons, for transparency in the UI.
   */
  sharedSafeIngredients(names: string[], members: MemberTasteContext[]): SharedSafetyResult {
    const safe: string[] = [];
    const blockedMap = new Map<string, Set<string>>();

    for (const name of names) {
      let isSafe = true;
      const reasons = new Set<string>();
      for (const member of members) {
        const reason = this.checkIngredient(name, member);
        if (reason) {
          isSafe = false;
          reasons.add(reason);
        }
      }
      if (isSafe) {
        safe.push(name);
      } else {
        const key = findBestMatch(name)?.name ?? name.trim().toLowerCase();
        const existing = blockedMap.get(key) ?? new Set<string>();
        reasons.forEach((r) => existing.add(r));
        blockedMap.set(key, existing);
      }
    }

    return {
      safe,
      blocked: [...blockedMap.entries()].map(([ingredient, reasons]) => ({
        ingredient,
        reasons: [...reasons],
      })),
    };
  }

  /** Which members can safely eat this ingredient (used for late branching). */
  membersWhoCanEat(name: string, members: MemberTasteContext[]): MemberTasteContext[] {
    return members.filter((member) => this.checkIngredient(name, member) === null);
  }
}

export function buildMemberTasteContext(input: {
  memberId: UUID;
  displayName: string;
  initials: string;
  relationship: string;
  allergies: string[];
  dietaryRestrictions: DietaryRestriction[];
  avoidIngredients: string[];
  likes: string[];
  dislikes: string[];
  spiceLevel?: 'mild' | 'medium' | 'spicy';
  textures: string[];
  learned: Record<string, number>;
}): MemberTasteContext {
  return {
    ...input,
    allergyKeys: normalizeAllergens(input.allergies),
  };
}
