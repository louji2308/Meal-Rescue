import { randomUUID } from 'node:crypto';

import type { UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

type ModificationSize = 'tiny' | 'small' | 'medium' | 'large';

interface ModificationMagnitudeRecord {
  userId: UUID;
  size: ModificationSize;
  confidence: number;
  sampleCount: number;
}

const SIZE_SCORES: Record<ModificationSize, number> = {
  tiny: 0.1,
  small: 0.25,
  medium: 0.5,
  large: 0.75,
};

/**
 * ModificationMagnitudeService - learns what counts as a "real change" for each user.
 *
 * Different users have different thresholds. For adventurous users, adding chili
 * oil is tiny. For cautious users, it's large.
 */
export class ModificationMagnitudeService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  /**
   * Get the user's magnitude classification for a modification.
   */
  async getMagnitude(userId: UUID, modification: string): Promise<ModificationMagnitudeRecord | null> {
    const normalized = modification.toLowerCase().trim();

    const existing = await this.models.TasteMemory.findOne({
      where: {
        userId,
        contextType: 'addition_modification',
        contextValue: normalized,
      },
    });

    if (!existing) {
      return {
        userId,
        size: 'medium',
        confidence: 0.3,
        sampleCount: 0,
      };
    }

    const data = existing.get();
    const size = this.classifySize(data.affinity ?? 0.5);

    return {
      userId,
      size,
      confidence: data.confidence ?? 0.5,
      sampleCount: data.observationCount ?? 1,
    };
  }

  /**
   * Record a user's response to a modification to learn their threshold.
   */
  async recordMagnitudeResponse(
    userId: UUID,
    modification: string,
    accepted: boolean,
  ): Promise<void> {
    const normalized = modification.toLowerCase().trim();
    const existing = await this.models.TasteMemory.findOne({
      where: {
        userId,
        contextType: 'addition_modification',
        contextValue: normalized,
      },
    });

    if (existing) {
      const data = existing.get();
      const currentAffinity = data.affinity ?? 0.5;
      const currentConfidence = data.confidence ?? 0.5;
      const currentSamples = data.observationCount ?? 1;

      // If accepted, this modification is SMALLER than they think
      // If rejected, this modification is LARGER than they think
      const newAffinity = accepted
        ? Math.max(0.05, currentAffinity - 0.05)
        : Math.min(0.95, currentAffinity + 0.05);

      await existing.update({
        affinity: newAffinity,
        confidence: Math.min(1, currentConfidence + 0.1),
        observationCount: currentSamples + 1,
      });
    } else {
      const initialAffinity = accepted ? 0.3 : 0.6;
      await this.models.TasteMemory.create({
        id: randomUUID(),
        userId,
        ingredient: 'modification',
        contextType: 'addition_modification',
        contextValue: normalized,
        affinity: initialAffinity,
        confidence: 0.3,
        observationCount: 1,
        source: 'feedback',
      });
    }
  }

  /**
   * Would this user accept a modification of this size?
   */
  async wouldAccept(userId: UUID, modification: string): Promise<{ accept: boolean; confidence: number }> {
    const mag = await this.getMagnitude(userId, modification);
    if (!mag) return { accept: true, confidence: 0.3 };

    const threshold = this.getAdventurousThreshold(userId);
    const sizeScore = SIZE_SCORES[mag.size];

    return {
      accept: sizeScore < threshold,
      confidence: mag.confidence,
    };
  }

  /**
   * Get user's adventurous threshold (0-1, higher = more adventurous).
   */
  private getAdventurousThreshold(userId: UUID): number {
    // Default to 0.5 (medium adventurousness)
    // Will learn from feedback over time
    return 0.5;
  }

  private classifySize(belief: number): ModificationSize {
    if (belief < 0.15) return 'tiny';
    if (belief < 0.35) return 'small';
    if (belief < 0.6) return 'medium';
    return 'large';
  }
}
