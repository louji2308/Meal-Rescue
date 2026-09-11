import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { TasteSensoryService } from './taste-sensory.service';
import { TasteTreatmentService } from './taste-treatment.service';
import { CuisineCompatibilityService } from './cuisine-compatibility.service';
import { ModificationMagnitudeService } from './modification-magnitude.service';
import { TasteExposureService } from './taste-exposure.service';
import { TasteEventService } from './taste-event.service';

interface RescueTasteContext {
  strongLikes: string[];
  strongDislikes: string[];
  sensoryProfile: Map<string, Array<{ dimension: string; preference: string; strength: number }>>;
  treatmentProfile: Map<string, Array<{ treatment: string; preference: string; strength: number }>>;
  overexposed: string[];
  cuisinePreferences: string[];
  modificationTolerance: number;
  recentDecisions: Array<{ ingredient: string; decision: string; timestamp: string }>;
}

/**
 * Builds a complete taste context for a user to personalize rescue recommendations.
 *
 * This is the bridge between the taste memory system and the LLM.
 * It gathers all signals and produces a structured context object
 * that gets injected into the AI rescue prompt.
 */
export class RescueTasteContextBuilder {
  private readonly models: Db['models'];
  private readonly tasteSensory: TasteSensoryService;
  private readonly tasteTreatment: TasteTreatmentService;
  private readonly cuisineCompatibility: CuisineCompatibilityService;
  private readonly modificationMagnitude: ModificationMagnitudeService;
  private readonly tasteExposure: TasteExposureService;
  private readonly tasteEvents: TasteEventService;

  constructor(
    models: Db['models'],
    tasteSensory: TasteSensoryService,
    tasteTreatment: TasteTreatmentService,
    cuisineCompatibility: CuisineCompatibilityService,
    modificationMagnitude: ModificationMagnitudeService,
    tasteExposure: TasteExposureService,
    tasteEvents: TasteEventService,
  ) {
    this.models = models;
    this.tasteSensory = tasteSensory;
    this.tasteTreatment = tasteTreatment;
    this.cuisineCompatibility = cuisineCompatibility;
    this.modificationMagnitude = modificationMagnitude;
    this.tasteExposure = tasteExposure;
    this.tasteEvents = tasteEvents;
  }

  async buildContext(userId: UUID): Promise<RescueTasteContext> {
    const [strongLikes, strongDislikes] = await this.getStrongPreferences(userId);
    const sensoryProfile = await this.tasteSensory.getAllBeliefs(userId);
    const treatmentProfile = await this.tasteTreatment.getAllBeliefs(userId);
    const overexposed = await this.tasteExposure.getOverexposed(userId);
    const cuisinePreferences = await this.getCuisinePreferences(userId);
    const modificationTolerance = await this.getModificationTolerance(userId);
    const recentDecisions = await this.getRecentDecisions(userId);

    return {
      strongLikes,
      strongDislikes,
      sensoryProfile,
      treatmentProfile,
      overexposed,
      cuisinePreferences,
      modificationTolerance,
      recentDecisions,
    };
  }

  /**
   * Format context for injection into LLM prompt.
   */
  formatForPrompt(ctx: RescueTasteContext): string {
    const lines: string[] = [];

    if (ctx.strongLikes.length > 0) {
      lines.push(`LOVES: ${ctx.strongLikes.join(', ')}`);
    }
    if (ctx.strongDislikes.length > 0) {
      lines.push(`AVOIDS: ${ctx.strongDislikes.join(', ')}`);
    }
    if (ctx.overexposed.length > 0) {
      lines.push(`TIRED OF (recently recommended): ${ctx.overexposed.join(', ')}`);
    }
    if (ctx.cuisinePreferences.length > 0) {
      lines.push(`CUISINE COMFORT ZONE: ${ctx.cuisinePreferences.join(', ')}`);
    }
    if (ctx.modificationTolerance < 0.3) {
      lines.push('MODIFICATION STYLE: Conservative — keep changes minimal');
    } else if (ctx.modificationTolerance > 0.7) {
      lines.push('MODIFICATION STYLE: Adventurous — open to bold changes');
    } else {
      lines.push('MODIFICATION STYLE: Moderate — open to some variation');
    }

    if (ctx.recentDecisions.length > 0) {
      const recent = ctx.recentDecisions.slice(0, 5);
      lines.push(`RECENT HISTORY: ${recent.map((d) => `${d.ingredient}=${d.decision}`).join(', ')}`);
    }

    return lines.join('\n');
  }

  private async getStrongPreferences(userId: UUID): Promise<[string[], string[]]> {
    const memories = await this.models.TasteMemory.findAll({
      where: { userId },
    });

    const likes: string[] = [];
    const dislikes: string[] = [];

    for (const m of memories) {
      const data = m.get();
      if (data.affinity > 0.5 && data.confidence > 0.6) {
        likes.push(data.ingredient);
      } else if (data.affinity < -0.3 && data.confidence > 0.6) {
        dislikes.push(data.ingredient);
      }
    }

    return [likes.slice(0, 10), dislikes.slice(0, 10)];
  }

  private async getCuisinePreferences(userId: UUID): Promise<string[]> {
    const memories = await this.models.TasteMemory.findAll({
      where: { userId, contextType: 'cuisine' },
      order: [['affinity', 'DESC']],
      limit: 10,
    });

    return memories
      .filter((m) => m.get().affinity > 0.2)
      .map((m) => m.get().contextValue);
  }

  private async getModificationTolerance(userId: UUID): Promise<number> {
    const memories = await this.models.TasteMemory.findAll({
      where: { userId, contextType: 'addition_modification' },
    });

    if (memories.length === 0) return 0.5;

    const avgAffinity = memories.reduce((sum, m) => sum + (m.get().affinity ?? 0.5), 0) / memories.length;
    return Math.max(0, Math.min(1, avgAffinity));
  }

  private async getRecentDecisions(userId: UUID): Promise<Array<{ ingredient: string; decision: string; timestamp: string }>> {
    const events = await this.tasteEvents.getRecentByUser(userId, { limit: 20 });

    return events
      .filter((e) => e.eventType.startsWith('RESCUE_'))
      .map((e) => ({
        ingredient: e.targetId,
        decision: e.eventType.replace('RESCUE_', ''),
        timestamp: e.createdAt,
      }));
  }
}
