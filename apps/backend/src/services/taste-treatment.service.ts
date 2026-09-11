import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

interface TreatmentBelief {
  ingredient: string;
  treatment: string;
  preference: string;
  strength: number;
  sampleCount: number;
}

const TREATMENT_MAP: Record<string, string[]> = {
  raw: ['salad', 'sushi', 'sashimi', 'raw'],
  roasted: ['roast', 'roasted', 'grilled', 'charred'],
  fried: ['fry', 'fried', 'crispy', 'sauté', 'saute'],
  braised: ['braise', 'braised', 'stew', 'slow'],
  fermented: ['ferment', 'kimchi', 'yogurt', 'sauce'],
  steamed: ['steam', 'steamed'],
  boiled: ['boil', 'boiled', 'soup'],
  baked: ['bake', 'baked', 'oven'],
};

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
 * TasteTreatmentService - derives and retrieves treatment beliefs per ingredient.
 *
 * Answers "how does this user want their chicken prepared?"
 */
export class TasteTreatmentService {
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

    const treatments = this.inferTreatments(modifications);

    for (const treatment of treatments) {
      await this.upsertPreference(userId, ingredient, treatment, sat.pref, sat.delta, eventId);
    }
  }

  async recordFromDecision(
    userId: UUID,
    ingredient: string,
    eventId: UUID,
    decision: string,
    modifications?: string[],
  ): Promise<void> {
    const dec = DECISION_MAP[decision];
    if (!dec) return;

    const treatments = this.inferTreatments(modifications);
    if (treatments.length === 0) return;

    for (const treatment of treatments) {
      await this.upsertPreference(userId, ingredient, treatment, dec.pref, dec.delta, eventId);
    }
  }

  async getBeliefs(userId: UUID, ingredient: string): Promise<TreatmentBelief[]> {
    const rows = await this.models.TasteTreatmentPreference.findAll({
      where: { userId, ingredient: ingredient.toLowerCase() },
    });

    return rows.map((r) => {
      const data = r.get();
      return {
        ingredient: data.ingredient,
        treatment: data.treatment,
        preference: data.preference,
        strength: data.strength,
        sampleCount: data.sampleCount,
      };
    });
  }

  async getAllBeliefs(userId: UUID): Promise<Map<string, TreatmentBelief[]>> {
    const rows = await this.models.TasteTreatmentPreference.findAll({
      where: { userId },
    });

    const map = new Map<string, TreatmentBelief[]>();
    for (const r of rows) {
      const data = r.get();
      const existing = map.get(data.ingredient) ?? [];
      existing.push({
        ingredient: data.ingredient,
        treatment: data.treatment,
        preference: data.preference,
        strength: data.strength,
        sampleCount: data.sampleCount,
      });
      map.set(data.ingredient, existing);
    }
    return map;
  }

  private inferTreatments(modifications?: string[]): string[] {
    const text = (modifications ?? []).join(' ').toLowerCase();
    const treatments: string[] = [];

    for (const [treatment, keywords] of Object.entries(TREATMENT_MAP)) {
      if (keywords.some((k) => text.includes(k))) {
        treatments.push(treatment);
      }
    }

    return treatments.length > 0 ? treatments : ['default'];
  }

  private async upsertPreference(
    userId: UUID,
    ingredient: string,
    treatment: string,
    pref: string,
    delta: number,
    eventId: UUID,
  ): Promise<void> {
    const normalized = ingredient.toLowerCase();
    const existing = await this.models.TasteTreatmentPreference.findOne({
      where: { userId, ingredient: normalized, treatment },
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
      await this.models.TasteTreatmentPreference.create({
        id: `treatment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userId,
        ingredient: normalized,
        treatment,
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
