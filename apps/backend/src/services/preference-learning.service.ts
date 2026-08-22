import { randomUUID } from 'node:crypto';

import type { PersonalizationInsight, PreferenceLearned, UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

/**
 * PreferenceLearningService - updates user preferences from feedback.
 *
 * Learning dimensions (from product vision):
 * - Favorite foods (what you consistently enjoy)
 * - Avoided foods (what you consistently reject)
 * - Preparation tolerance (effort you'll accept)
 * - Time patterns (when you need quick vs elaborate)
 * - Ingredient availability (what you typically have)
 * - Preferred flavors (taste profile patterns)
 * - Rescue pattern success (which interventions work for YOU)
 *
 * Each preference row tracks confidenceScore (0.0-1.0) and observationCount.
 * Confidence grows with consistent observations; contradicting feedback reduces it.
 */
export class PreferenceLearningService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async processFeedback(
    userId: UUID,
    rescue: {
      selectedRecommendation: Record<string, unknown>;
      userDecision: string;
      constraints?: Record<string, unknown>;
    },
    satisfaction: string,
    _feedbackText?: string | null,
  ): Promise<PersonalizationInsight[]> {
    const insights: PersonalizationInsight[] = [];

    const recommendation = rescue.selectedRecommendation as Record<string, unknown>;
    const candidate = recommendation.candidate as Record<string, unknown> | undefined;
    const additions = (candidate?.additions as Array<{ name: string }>) ?? [];
    const substitutions =
      (candidate?.substitutions as Array<{
        original: { name: string };
        replacement: { name: string };
      }>) ?? [];

    const allIngredients = [
      ...additions.map((a) => a.name.toLowerCase()),
      ...substitutions.map((s) => s.replacement.name.toLowerCase()),
    ];

    if (satisfaction === 'better') {
      for (const ingredient of allIngredients) {
        await this.upsertPreference(userId, 'favorite_ingredient', ingredient, { count: 1 }, 0.15);
      }
      insights.push({
        type: 'favorite_ingredient',
        description: `You liked ${allIngredients.join(', ')}`,
        confidence: 0.65,
      });
    } else if (satisfaction === 'not_for_me') {
      for (const ingredient of allIngredients) {
        await this.upsertPreference(userId, 'avoided_ingredient', ingredient, { count: 1 }, 0.2);
      }
      insights.push({
        type: 'avoided_ingredient',
        description: `You didn't like ${allIngredients.join(', ')}`,
        confidence: 0.7,
      });
    }

    const effort = candidate?.cookingSteps as number | undefined;
    if (effort !== undefined) {
      const tolerance = effort <= 1 ? 'low' : effort <= 3 ? 'medium' : 'high';
      await this.upsertPreference(userId, 'prep_tolerance', tolerance, { maxSteps: effort }, 0.1);
    }

    const timeMinutes = rescue.constraints?.timeMinutes as number | undefined;
    if (timeMinutes !== undefined) {
      const pattern = timeMinutes <= 10 ? 'quick' : timeMinutes <= 30 ? 'moderate' : 'elaborate';
      await this.upsertPreference(userId, 'time_pattern', pattern, { minutes: timeMinutes }, 0.08);
    }

    const decision = rescue.userDecision;
    if (decision === 'accepted' || decision === 'swapped') {
      const patternKey = additions.length > 0 ? 'addition' : 'substitution';
      await this.upsertPreference(userId, 'rescue_pattern', patternKey, { success: true }, 0.12);
    } else if (decision === 'rejected' || decision === 'kept_as_is') {
      await this.upsertPreference(userId, 'rescue_pattern', 'rejected', { success: false }, 0.15);
    }

    return insights;
  }

  async getLearnedPreferences(userId: UUID): Promise<PreferenceLearned[]> {
    const prefs = await this.models.Preference.findAll({
      where: { userId },
      order: [['confidenceScore', 'DESC']],
    });

    return prefs.map((p) => ({
      preferenceType: p.preferenceType,
      preferenceKey: p.preferenceKey,
      preferenceValue: p.preferenceValue as object,
      confidenceScore: Number(p.confidenceScore),
      observationCount: p.observationCount,
      lastUpdated: p.lastUpdated.toISOString(),
    }));
  }

  private async upsertPreference(
    userId: UUID,
    type: string,
    key: string,
    value: object,
    confidenceDelta: number,
  ): Promise<void> {
    const existing = await this.models.Preference.findOne({
      where: { userId, preferenceType: type, preferenceKey: key },
    });

    if (existing) {
      const newConfidence = Math.min(
        1,
        Math.max(0, Number(existing.confidenceScore) + confidenceDelta),
      );
      existing.confidenceScore = newConfidence;
      existing.observationCount += 1;
      existing.preferenceValue = { ...(existing.preferenceValue as object), ...value };
      existing.lastUpdated = new Date();
      await existing.save();
    } else {
      await this.models.Preference.create({
        id: randomUUID(),
        userId,
        preferenceType: type,
        preferenceKey: key,
        preferenceValue: value,
        confidenceScore: Math.min(0.5 + confidenceDelta, 1),
        observationCount: 1,
        lastUpdated: new Date(),
      });
    }
  }
}
