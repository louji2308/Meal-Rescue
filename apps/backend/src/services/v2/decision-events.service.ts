/**
 * V2 Decision Event log (plan §27 / §9).
 *
 * Appends DecisionEvent rows for backend-relevant events only:
 *   RESCUE_STARTED, RECOMMENDATION_PRESENTED, MEAL_COMPLETED,
 *   SATISFACTION_RECORDED, NOTIFICATION_SENT, NOTIFICATION_OPENED.
 *
 * Deliberately thin - no over-instrumentation. Missing contextual ids are
 * simply omitted from the row.
 */
import { randomUUID } from 'node:crypto';

import type { MealRescueEventType, UUID } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';

export interface DecisionEventInput {
  eventType: MealRescueEventType;
  userId?: UUID;
  mealId?: UUID;
  rescueId?: UUID;
  payload?: Record<string, unknown>;
}

export class DecisionEventService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async record(input: DecisionEventInput): Promise<void> {
    await this.models.DecisionEvent.create({
      id: randomUUID(),
      eventType: input.eventType,
      userId: input.userId ?? null,
      mealId: input.mealId ?? null,
      rescueId: input.rescueId ?? null,
      payload: input.payload ? { ...input.payload } : null,
    });
  }

  /** How many times a given event type fired for a rescue (e.g. aftercare dedupe). */
  async countForRescue(rescueId: UUID, eventType: MealRescueEventType): Promise<number> {
    return this.models.DecisionEvent.count({ where: { rescueId, eventType } });
  }

  async existsForRescue(rescueId: UUID, eventType: MealRescueEventType): Promise<boolean> {
    return (await this.countForRescue(rescueId, eventType)) > 0;
  }
}
