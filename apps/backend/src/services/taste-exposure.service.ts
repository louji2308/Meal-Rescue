import { randomUUID } from 'node:crypto';

import type { ExposureState, TasteTargetType } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

const EXPOSURE_WINDOW_DAYS = 14;
const OVEREXPOSURE_THRESHOLD = 3;
const DECAY_INTERVAL_MS = EXPOSURE_WINDOW_DAYS * 86400000;

/**
 * TasteExposureService - tracks recent exposure to prevent repetition.
 *
 * Exposure never changes preference by itself. It affects candidate ranking.
 * A high-affinity ingredient that was recommended 4 times this week should
 * lose to a slightly less exciting alternative.
 */
export class TasteExposureService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async recordRecommendation(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<void> {
    const row = await this.getOrCreate(userId, targetType, targetId);
    row.recentRecommendations += 1;
    row.consecutiveExposure += 1;
    row.lastRecommendedAt = new Date();
    await row.save();
  }

  async recordCompletion(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<void> {
    const row = await this.getOrCreate(userId, targetType, targetId);
    row.recentCompletions += 1;
    row.consecutiveExposure = 0;
    row.lastCompletedAt = new Date();
    await row.save();
  }

  async getExposure(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ): Promise<ExposureState> {
    const row = await this.models.TasteExposure.findOne({
      where: { userId, targetType, targetId: targetId.toLowerCase() },
    });

    if (!row) {
      return {
        targetType,
        targetId,
        recentRecommendations: 0,
        recentCompletions: 0,
        consecutiveExposure: 0,
      };
    }

    const data = row.get();
    // Decay if window expired
    if (Date.now() - new Date(data.windowStart).getTime() > DECAY_INTERVAL_MS) {
      data.recentRecommendations = Math.max(0, data.recentRecommendations - 1);
      data.recentCompletions = Math.max(0, data.recentCompletions - 1);
      data.windowStart = new Date();
      await row.save();
    }

    return {
      targetType: data.targetType as TasteTargetType,
      targetId: data.targetId,
      recentRecommendations: data.recentRecommendations,
      recentCompletions: data.recentCompletions,
      lastRecommendedAt: data.lastRecommendedAt?.toISOString() ?? undefined,
      lastCompletedAt: data.lastCompletedAt?.toISOString() ?? undefined,
      consecutiveExposure: data.consecutiveExposure,
    };
  }

  async getOverexposed(userId: string, withinDays = 7): Promise<string[]> {
    const since = new Date(Date.now() - withinDays * 86400000);
    const rows = await this.models.TasteExposure.findAll({
      where: { userId },
    });

    return rows
      .filter((r) => {
        const data = r.get();
        return (
          data.recentRecommendations >= OVEREXPOSURE_THRESHOLD ||
          (data.lastRecommendedAt && data.lastRecommendedAt >= since)
        );
      })
      .map((r) => r.get().targetId);
  }

  private async getOrCreate(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
  ) {
    const normalizedId = targetId.toLowerCase();
    const existing = await this.models.TasteExposure.findOne({
      where: { userId, targetType, targetId: normalizedId },
    });

    if (existing) return existing;

    return this.models.TasteExposure.create({
      id: randomUUID(),
      userId,
      targetType,
      targetId: normalizedId,
      recentRecommendations: 0,
      recentCompletions: 0,
      consecutiveExposure: 0,
      windowStart: new Date(),
    });
  }
}
