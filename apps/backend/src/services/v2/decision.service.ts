/**
 * V2 Decision Commit (plan §9 / §27).
 *
 * POST /api/v1/rescue/:id/decide persists the user's ACTUAL action on the
 * rescue record. The row is created with userDecision='pending' at generate
 * time; this service is what mutates it to a real UserDecision
 * (accepted / swapped / rejected / kept_as_is).
 *
 * It exists because the legacy feedback loop and the meal_completed aftercare
 * gate both depend on a decided rescue: satisfaction capture is rejected until
 * userDecision is set, and MEAL_COMPLETED is only a meaningful signal once the
 * user actually committed to a move.
 *
 * Deliberately last-write-wins: a user can preview alternatives or change
 * their mind before completing, and each decide logs a RECOMMENDATION_SELECTED
 * DecisionEvent so the journey is auditable.
 */
import type { DecideResponse, UUID, UserDecision } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError, ErrorCategory } from '../../lib/errors';
import { DecisionEventService } from './decision-events.service';

export class DecisionService {
  private readonly models: Db['models'];
  private readonly events: DecisionEventService;

  constructor(models: Db['models']) {
    this.models = models;
    this.events = new DecisionEventService(models);
  }

  async commit(rescueId: UUID, userId: UUID, action: UserDecision): Promise<DecideResponse> {
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

    rescue.userDecision = action;
    rescue.decisionTimestamp = new Date();
    await rescue.save();

    // Journey event: which recommendation the user actually committed to.
    await this.events.record({
      eventType: 'RECOMMENDATION_SELECTED',
      userId,
      rescueId,
      payload: {
        action,
        decisionAction: rescue.decisionAction,
      },
    });

    return {
      success: true,
      rescueId,
      userDecision: action,
      decisionTimestamp: rescue.decisionTimestamp.toISOString(),
    };
  }
}
