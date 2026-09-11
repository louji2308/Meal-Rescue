import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

interface CuisineCompatibility {
  cuisineA: string;
  cuisineB: string;
  affinity: number; // -1.0 to 1.0
  sampleCount: number;
}

// Pre-defined compatibility graph (will learn from user data over time)
const BASE_COMPATIBILITY: Record<string, Record<string, number>> = {
  italian: { japanese: 0.3, mexican: 0.4, indian: 0.2, thai: 0.3, korean: 0.2, chinese: 0.3, french: 0.5, mediterranean: 0.7 },
  japanese: { italian: 0.3, korean: 0.6, chinese: 0.5, thai: 0.4, vietnamese: 0.5, french: 0.2 },
  mexican: { italian: 0.4, indian: 0.3, thai: 0.4, korean: 0.2, chinese: 0.2, spanish: 0.7 },
  indian: { thai: 0.5, korean: 0.3, chinese: 0.3, japanese: 0.3, mexican: 0.3, pakistani: 0.8 },
  korean: { japanese: 0.6, chinese: 0.5, vietnamese: 0.5, thai: 0.4, mexican: 0.2 },
  chinese: { japanese: 0.5, korean: 0.5, vietnamese: 0.5, thai: 0.4, singaporean: 0.6 },
  thai: { vietnamese: 0.6, chinese: 0.4, korean: 0.4, japanese: 0.4, indian: 0.5, malaysian: 0.7 },
  french: { italian: 0.5, mediterranean: 0.6, japanese: 0.2, spanish: 0.5 },
  mediterranean: { italian: 0.7, french: 0.6, greek: 0.8, turkish: 0.7, middle_eastern: 0.7 },
  vietnamese: { thai: 0.6, chinese: 0.5, korean: 0.5, japanese: 0.5, laotian: 0.7, cambodian: 0.7 },
};

/**
 * CuisineCompatibilityService - learns cuisine blending preferences.
 *
 * Answers "would this user accept adding soy sauce to pasta?"
 * Uses cuisine family distances and user acceptance history.
 */
export class CuisineCompatibilityService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  /**
   * Get base compatibility between two cuisine families.
   */
  getBaseCompatibility(cuisineA: string, cuisineB: string): number {
    const a = cuisineA.toLowerCase();
    const b = cuisineB.toLowerCase();

    if (a === b) return 1.0;

    return BASE_COMPATIBILITY[a]?.[b] ?? BASE_COMPATIBILITY[b]?.[a] ?? 0.1;
  }

  /**
   * Get user-specific compatibility override from acceptance history.
   */
  async getUserCompatibility(userId: UUID, cuisineA: string, cuisineB: string): Promise<CuisineCompatibility | null> {
    const rows = await this.models.TasteEvent.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 200,
    });

    const crossCuisineAccepts = rows.filter((r) => {
      const data = r.get();
      const meta = data.metadata as Record<string, unknown> | null;
      const isAccepted = data.eventType === 'RESCUE_ACCEPTED' || data.eventType === 'SATISFACTION_NAILED';
      const baseCompat = this.getBaseCompatibility(cuisineA, cuisineB);
      const usesCrossCuisine = baseCompat > 0 && baseCompat < 0.8;
      return isAccepted && usesCrossCuisine && meta?.['cuisine'] === cuisineA;
    });

    if (crossCuisineAccepts.length < 3) return null;

    return {
      cuisineA,
      cuisineB,
      affinity: 0.6,
      sampleCount: crossCuisineAccepts.length,
    };
  }

  /**
   * Get blended compatibility score for a cross-cuisine suggestion.
   */
  async getBlendedCompatibility(
    userId: UUID,
    baseCuisine: string,
    suggestedCuisine: string,
  ): Promise<number> {
    const base = this.getBaseCompatibility(baseCuisine, suggestedCuisine);
    const user = await this.getUserCompatibility(userId, baseCuisine, suggestedCuisine);

    if (!user) return base;

    // Blend: 70% base graph, 30% user override (grows with sample count)
    const userWeight = Math.min(0.5, user.sampleCount * 0.05);
    return base * (1 - userWeight) + user.affinity * userWeight;
  }

  /**
   * Suggest compatible cuisines for a given base cuisine.
   */
  async suggestCompatibleCuisines(
    userId: UUID,
    baseCuisine: string,
    limit = 3,
  ): Promise<string[]> {
    const scores: Array<{ cuisine: string; score: number }> = [];

    for (const [cuisine, compat] of Object.entries(BASE_COMPATIBILITY[baseCuisine] ?? {})) {
      const blended = await this.getBlendedCompatibility(userId, baseCuisine, cuisine);
      scores.push({ cuisine, score: blended });
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.cuisine);
  }
}
