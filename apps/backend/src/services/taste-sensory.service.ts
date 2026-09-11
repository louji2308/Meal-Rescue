import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

interface SensoryBelief {
  ingredient: string;
  dimension: string;
  preference: string;
  strength: number;
  sampleCount: number;
}

const DIMENSIONS = ['flavor', 'texture', 'temperature', 'intensity'] as const;
const SATISFACTION_MAP: Record<string, { pref: string; delta: number }> = {
  better: { pref: 'love', delta: 0.15 },
  not_for_me: { pref: 'dislike', delta: 0.2 },
  almost: { pref: 'like', delta: 0.05 },
};
const DECISION_MAP: Record<string, { pref: string; delta: number }> = {
  accepted: { pref: 'like', delta: 0.1 },
  swapped: { pref: 'dislike', delta: 0.15 },
  rejected: { pref: 'hate', delta: 0.2 },
};

/**
 * TasteSensoryService - derives and retrieves sensory beliefs per ingredient.
 *
 * Infers flavor/texture/temperature/intensity preferences from completed meals
 * and satisfaction feedback. Answers "what does this user like about eggs?"
 */
export class TasteSensoryService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async recordFromFeedback(
    userId: UUID,
    ingredient: string,
    eventId: UUID,
    satisfaction: string,
    modifications?: string[],
  ): Promise<void> {
    const sat = SATISFACTION_MAP[satisfaction];
    if (!sat) return;

    const dims = this.inferDimensions(ingredient, modifications);

    for (const dim of dims) {
      await this.upsertPreference(userId, ingredient, dim, sat.pref, sat.delta, eventId);
    }
  }

  async recordFromDecision(
    userId: UUID,
    ingredient: string,
    eventId: UUID,
    decision: string,
  ): Promise<void> {
    const dec = DECISION_MAP[decision];
    if (!dec) return;

    for (const dim of DIMENSIONS) {
      await this.upsertPreference(userId, ingredient, dim, dec.pref, dec.delta, eventId);
    }
  }

  async getBeliefs(userId: UUID, ingredient: string): Promise<SensoryBelief[]> {
    const rows = await this.models.TasteSensoryPreference.findAll({
      where: { userId, ingredient: ingredient.toLowerCase() },
    });

    return rows.map((r) => {
      const data = r.get();
      return {
        ingredient: data.ingredient,
        dimension: data.dimension,
        preference: data.preference,
        strength: data.strength,
        sampleCount: data.sampleCount,
      };
    });
  }

  async getAllBeliefs(userId: UUID): Promise<Map<string, SensoryBelief[]>> {
    const rows = await this.models.TasteSensoryPreference.findAll({
      where: { userId },
    });

    const map = new Map<string, SensoryBelief[]>();
    for (const r of rows) {
      const data = r.get();
      const existing = map.get(data.ingredient) ?? [];
      existing.push({
        ingredient: data.ingredient,
        dimension: data.dimension,
        preference: data.preference,
        strength: data.strength,
        sampleCount: data.sampleCount,
      });
      map.set(data.ingredient, existing);
    }
    return map;
  }

  private inferDimensions(
    ingredient: string,
    modifications?: string[],
  ): string[] {
    const text = [ingredient, ...(modifications ?? [])].join(' ').toLowerCase();

    const dims: string[] = ['flavor'];
    if (/crisp|soft|mushy|tender|crunchy|chewy/.test(text)) dims.push('texture');
    if (/hot|cold|warm|chill|frozen/.test(text)) dims.push('temperature');
    if (/mild|spicy|intense|subtle|bold|strong/.test(text)) dims.push('intensity');

    return dims.length > 1 ? dims : [...DIMENSIONS];
  }

  private async upsertPreference(
    userId: UUID,
    ingredient: string,
    dimension: string,
    pref: string,
    delta: number,
    eventId: UUID,
  ): Promise<void> {
    const normalized = ingredient.toLowerCase();
    const existing = await this.models.TasteSensoryPreference.findOne({
      where: { userId, ingredient: normalized, dimension },
    });

    if (existing) {
      const data = existing.get();
      const currentStrength = data.strength;
      const newStrength =
        pref === 'love' || pref === 'like'
          ? Math.min(1, currentStrength + delta)
          : Math.max(0, currentStrength - delta);

      await existing.update({
        preference: pref,
        strength: newStrength,
        sampleCount: data.sampleCount + 1,
        sourceEventId: eventId,
        lastConfirmedAt: new Date(),
      });
    } else {
      await this.models.TasteSensoryPreference.create({
        id: `sensory_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId,
        ingredient: normalized,
        dimension,
        preference: pref,
        strength: delta,
        sourceEventId: eventId,
        sampleCount: 1,
        lastConfirmedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}
