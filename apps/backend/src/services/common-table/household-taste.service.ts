import { Op } from 'sequelize';

import type { DietaryRestriction, UUID } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { type MemberTasteContext, buildMemberTasteContext } from './household-constraint.service';

/**
 * HouseholdTasteService — builds each selected member's resolved taste
 * context from the lightweight member profile PLUS the learned
 * household_preferences layer, so convergence gets both declared
 * preferences and accumulated shared-table experience.
 */
export class HouseholdTasteService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async buildContext(memberIds: UUID[]): Promise<MemberTasteContext[]> {
    if (memberIds.length === 0) return [];

    const members = await this.models.HouseholdMember.findAll({
      where: { id: { [Op.in]: memberIds } },
    });
    const byId = new Map(members.map((m) => [m.id, m]));

    const preferenceRows = await this.models.HouseholdPreference.findAll({
      where: { memberId: { [Op.in]: memberIds } },
    });

    return memberIds
      .map((memberId) => {
        const member = byId.get(memberId);
        if (!member) return null;
        const plain = member.get({ plain: true }) as {
          id: UUID;
          displayName: string;
          initials: string;
          relationship: string;
          constraints: {
            allergies: string[];
            dietaryRestrictions: DietaryRestriction[];
            avoidIngredients: string[];
          };
          preferences: {
            likes: string[];
            dislikes: string[];
            spiceLevel?: 'mild' | 'medium' | 'spicy';
            textures?: string[];
          };
        };

        const learned: Record<string, number> = {};
        for (const row of preferenceRows.filter((r) => r.memberId === memberId)) {
          learned[row.ingredient] = Number(row.affinity);
        }

        return buildMemberTasteContext({
          memberId: plain.id,
          displayName: plain.displayName,
          initials: plain.initials,
          relationship: plain.relationship,
          allergies: plain.constraints?.allergies ?? [],
          dietaryRestrictions: plain.constraints?.dietaryRestrictions ?? [],
          avoidIngredients: plain.constraints?.avoidIngredients ?? [],
          likes: plain.preferences?.likes ?? [],
          dislikes: plain.preferences?.dislikes ?? [],
          spiceLevel: plain.preferences?.spiceLevel,
          textures: plain.preferences?.textures ?? [],
          learned,
        });
      })
      .filter((context): context is MemberTasteContext => context !== null);
  }

  /**
   * Learns from a completed shared meal: shared base ingredients gain equal
   * affinity for every member; branch finishes boost just the member who ate
   * them. Upserts HouseholdPreference rows.
   */
  async applyOutcome(input: {
    memberIds: UUID[];
    sharedIngredients: string[];
    perMemberIngredientBonuses: Map<UUID, { ingredient: string; affinity: number }[]>;
    ratingDelta: number;
  }): Promise<void> {
    const updates: {
      memberId: UUID;
      ingredient: string;
      delta: number;
    }[] = [];

    for (const memberId of input.memberIds) {
      for (const ingredient of input.sharedIngredients) {
        updates.push({ memberId, ingredient, delta: input.ratingDelta });
      }
    }
    for (const [memberId, bonuses] of input.perMemberIngredientBonuses) {
      for (const bonus of bonuses) {
        updates.push({ memberId, ingredient: bonus.ingredient, delta: bonus.affinity });
      }
    }

    for (const update of updates) {
      const existing = await this.models.HouseholdPreference.findOne({
        where: { memberId: update.memberId, ingredient: update.ingredient },
      });
      if (existing) {
        const count = existing.observationCount + 1;
        const nextAffinity = clamp(
          Number(existing.affinity) +
            (update.delta - Number(existing.affinity)) / Math.min(count, 5),
          -1,
          1,
        );
        await existing.update({
          affinity: nextAffinity,
          confidence: Math.min(1, Number(existing.confidence) + 0.1),
          observationCount: count,
          lastObservedAt: new Date(),
        });
      } else {
        await this.models.HouseholdPreference.create({
          memberId: update.memberId,
          ingredient: update.ingredient,
          affinity: clamp(update.delta, -1, 1),
          confidence: 0.5,
          observationCount: 1,
          lastObservedAt: new Date(),
        });
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
