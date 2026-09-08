/**
 * V2 Satisfaction Store (plan §8 / §17).
 *
 * POST /api/v1/rescue/:id/satisfaction persists an explicit SatisfactionRecord
 * and feeds preference-learning as a HIGHER-WEIGHT signal than passive history.
 * Only explicit feedback is learned; no mood/emotion inference.
 */
import { randomUUID } from 'node:crypto';

import type {
  SatisfactionRecord,
  SatisfactionRecordRequest,
  SatisfactionRecordResponse,
  UUID,
} from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError, ErrorCategory } from '../../lib/errors';
import { PreferenceLearningService } from '../preference-learning.service';
import { DecisionEventService } from './decision-events.service';

export const SATISFACTION_TO_LEGACY: Record<string, string> = {
  EXACTLY: 'better',
  ALMOST: 'same',
  NOT_REALLY: 'not_for_me',
};

/** Explicit satisfaction feedback out-weights passive history (plan §8). */
const EXPLICIT_FEEDBACK_WEIGHT_BOOST = 2;

/**
 * Plain-language impact statements, keyed by result. These are the
 * "We'll lean toward X for you" lines shown back to the user.
 */
export function personalizationImpact(result: string, reason: string[] = []): string[] {
  const lines: string[] = [];
  if (result === 'EXACTLY') {
    lines.push("We'll keep recommending options like this one.");
  } else if (result === 'ALMOST') {
    lines.push("We'll fine-tune the details so it's even closer next time.");
    if (reason.includes('too_much_effort')) {
      lines.push("We'll lean toward simpler options for you.");
    }
  } else if (result === 'NOT_REALLY') {
    lines.push("We'll avoid repeating this kind of recommendation.");
    if (reason.includes('too_much_effort')) {
      lines.push("We'll lean toward simpler, lower-effort options for you.");
    }
  }
  if (lines.length === 0)
    lines.push("We've noted your feedback — we'll use it for your next rescue.");
  return lines;
}

export class SatisfactionService {
  private readonly models: Db['models'];
  private readonly events: DecisionEventService;

  constructor(models: Db['models']) {
    this.models = models;
    this.events = new DecisionEventService(models);
  }

  async record(
    rescueId: UUID,
    userId: UUID,
    payload: SatisfactionRecordRequest,
  ): Promise<SatisfactionRecordResponse> {
    const rescue = await this.models.Rescue.findOne({ where: { id: rescueId, userId } });
    if (!rescue) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'RESCUE_NOT_FOUND',
        message: 'Rescue not found',
        statusCode: 404,
        recoverable: false,
      });
    }

    // Idempotent: one satisfaction record per rescue.
    let record = await this.models.SatisfactionRecord.findOne({ where: { rescueId, userId } });
    if (!record) {
      record = await this.models.SatisfactionRecord.create({
        id: randomUUID(),
        rescueId,
        userId,
        result: payload.result,
        reason: payload.reason ?? null,
      });

      // Event log (plan §9): explicit satisfaction is a first-class decision
      // event. Fired once per rescue - we never re-log on idempotent re-records.
      await this.events.record({
        eventType: 'SATISFACTION_RECORDED',
        userId,
        rescueId,
        payload: {
          result: payload.result,
          reason: payload.reason ?? [],
        },
      });
    } else {
      record.set({ result: payload.result, reason: payload.reason ?? null });
      await record.save();
    }

    // Higher-weight explicit learning signal (plan §8).
    await this.applyPreferenceLearning(userId, rescue, payload);

    const recorded: SatisfactionRecord = {
      rescueId,
      result: record.result,
      reason: record.reason ?? undefined,
      timestamp: record.createdAt.toISOString(),
    };

    return {
      success: true,
      recorded,
      personalizationImpact: personalizationImpact(payload.result, payload.reason ?? []),
    };
  }

  async getForRescue(rescueId: UUID, userId: UUID): Promise<SatisfactionRecord | null> {
    const record = await this.models.SatisfactionRecord.findOne({ where: { rescueId, userId } });
    if (!record) return null;
    return {
      rescueId: record.rescueId,
      result: record.result,
      reason: record.reason ?? undefined,
      timestamp: record.createdAt.toISOString(),
    };
  }

  private async applyPreferenceLearning(
    userId: UUID,
    rescue: {
      selectedRecommendation: unknown;
      userDecision: string;
      constraints?: unknown;
    },
    payload: SatisfactionRecordRequest,
  ): Promise<void> {
    // Reuse the existing PreferenceLearningService with the legacy satisfaction
    // mapping. Explicit satisfaction feedback is a HIGHER-WEIGHT learning input
    // than passive history (plan §8), applied via weightBoost.
    const learning = new PreferenceLearningService(this.models);
    await learning.processFeedback(
      userId,
      {
        selectedRecommendation: rescue.selectedRecommendation as Record<string, unknown>,
        userDecision: rescue.userDecision,
        constraints: rescue.constraints as Record<string, unknown> | undefined,
      },
      SATISFACTION_TO_LEGACY[payload.result] ?? 'same',
      undefined,
      undefined,
      EXPLICIT_FEEDBACK_WEIGHT_BOOST,
    );
  }
}
