import { randomUUID } from 'node:crypto';

import type { FeedbackRequest, FeedbackResponse, UUID } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import { PreferenceLearningService } from './preference-learning.service';
import { TasteEventService } from './taste-event.service';
import { TasteMemoryService } from './taste-memory.service';
import { DecisionEventService } from './v2/decision-events.service';

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
  private readonly decisionEvents: DecisionEventService;
  private readonly tasteEvents: TasteEventService;

  constructor(models: Db['models'], tasteEvents: TasteEventService) {
    this.models = models;
    this.preferenceLearning = new PreferenceLearningService(models);
    this.decisionEvents = new DecisionEventService(models);
    this.tasteEvents = tasteEvents;
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

    // Meal completion event (plan §9): fires once a user reports the rescue as
    // completed. The V2 aftercare check-in gate depends on this event existing.
    if (outcome?.completed) {
      await this.decisionEvents.record({
        eventType: 'MEAL_COMPLETED',
        userId,
        rescueId,
        payload: {
          userDecision: rescue.userDecision,
          decisionAction: rescue.decisionAction,
          actualTime: outcome.actualTime ?? null,
          modifications: outcome.modifications ?? [],
        },
      });
    }

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
      outcome?.modifications,
    );

    const selectedRecommendation = rescue.selectedRecommendation as Record<string, unknown>;
    const tasteMemory = new TasteMemoryService(this.models);
    await tasteMemory.recordCultureContext(userId, { selectedRecommendation }, rescue.userDecision);
    await tasteMemory.recordDecision(userId, rescue.userDecision, { selectedRecommendation });

    // --- V2 Taste Events ---
    const candidate = (selectedRecommendation.candidate as
      | { additions?: Array<{ name: string }>; substitutions?: Array<{ replacement: { name: string } }> }
      | undefined) ?? { additions: [], substitutions: [] };

    const ingredientNames = [
      ...(candidate.additions ?? []).map((a) => a.name.toLowerCase()),
      ...(candidate.substitutions ?? []).map((s) => s.replacement.name.toLowerCase()),
    ];

    const decisionEventType =
      rescue.userDecision === 'accepted'
        ? 'RESCUE_ACCEPTED'
        : rescue.userDecision === 'swapped'
          ? 'RESCUE_SWAPPED'
          : 'RESCUE_REJECTED';

    for (const name of ingredientNames) {
      await this.tasteEvents.emit({
        userId,
        eventType: decisionEventType,
        targetType: 'ingredient',
        targetId: name,
        contextKey: `rescue:${rescueId}`,
        sourceStrength: decisionEventType === 'RESCUE_REJECTED' ? 0.7 : 0.5,
        attributionConfidence: 0.5,
        rescueId,
      });
    }

    const satisfactionEventType =
      satisfaction === 'better'
        ? 'SATISFACTION_NAILED'
        : satisfaction === 'not_for_me'
          ? 'SATISFACTION_NOT_FOR_ME'
          : 'SATISFACTION_ALMOST';

    for (const name of ingredientNames) {
      await this.tasteEvents.emit({
        userId,
        eventType: satisfactionEventType,
        targetType: 'ingredient',
        targetId: name,
        contextKey: `rescue:${rescueId}`,
        sourceStrength: satisfaction === 'better' ? 0.8 : satisfaction === 'not_for_me' ? 0.9 : 0.4,
        attributionConfidence: 0.6,
        rescueId,
      });
    }

    return {
      success: true,
      personalizationUpdated: insights.length > 0,
      insights,
    };
  }
}
