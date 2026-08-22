import { randomUUID } from 'node:crypto';

import type { FeedbackRequest, FeedbackResponse, UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import { PreferenceLearningService } from './preference-learning.service';

/**
 * FeedbackService - handles post-rescue satisfaction feedback.
 *
 * Responsibilities:
 * 1. Persist feedback to rescue record + feedback table
 * 2. Trigger preference learning from the feedback
 * 3. Return structured response with personalization insights
 */
export class FeedbackService {
  private readonly models: Db['models'];
  private readonly preferenceLearning: PreferenceLearningService;

  constructor(models: Db['models']) {
    this.models = models;
    this.preferenceLearning = new PreferenceLearningService(models);
  }

  async submitFeedback(
    rescueId: UUID,
    userId: UUID,
    payload: FeedbackRequest,
  ): Promise<FeedbackResponse> {
    const rescue = await this.models.Rescue.findOne({
      where: { id: rescueId, userId },
    });

    if (!rescue) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'RESCUE_NOT_FOUND',
        message: 'Rescue not found',
        statusCode: 404,
        recoverable: false,
      });
    }

    if (rescue.userDecision === 'pending') {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'RESCUE_NOT_DECIDED',
        message: 'Cannot submit feedback before choosing an action',
        statusCode: 400,
        recoverable: true,
        suggestedAction: 'Choose Rescue, Swap, Dont Have, or Keep As-Is first',
      });
    }

    if (rescue.satisfactionFeedback !== null) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'FEEDBACK_ALREADY_SUBMITTED',
        message: 'Feedback already submitted for this rescue',
        statusCode: 409,
        recoverable: false,
      });
    }

    const { satisfaction, feedbackText, outcome } = payload;

    rescue.satisfactionFeedback = satisfaction;
    rescue.feedbackText = feedbackText ?? null;
    rescue.feedbackTimestamp = new Date();
    if (outcome) {
      rescue.outcome = outcome;
    }
    await rescue.save();

    await this.models.Feedback.create({
      id: randomUUID(),
      rescueId,
      userId,
      feedbackType: 'satisfaction',
      feedbackValue: {
        satisfaction,
        feedbackText,
        outcome,
      },
      context: {
        userDecision: rescue.userDecision,
        recommendation: rescue.selectedRecommendation,
      },
    });

    const insights = await this.preferenceLearning.processFeedback(
      userId,
      {
        selectedRecommendation: rescue.selectedRecommendation as Record<string, unknown>,
        userDecision: rescue.userDecision,
        constraints: rescue.constraints as Record<string, unknown> | undefined,
      },
      satisfaction,
      feedbackText,
    );

    return {
      success: true,
      personalizationUpdated: insights.length > 0,
      insights,
    };
  }
}
