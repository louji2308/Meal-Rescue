import { randomUUID } from 'node:crypto';

import type { TasteEvent, TasteEventType, TasteTargetType } from '@meal-rescue/shared-types';

import type { Db } from '../database/models';

/**
 * TasteEventService - emits immutable taste events.
 *
 * Every taste signal flows through here. Events are never updated or deleted.
 * Belief derivation happens asynchronously after emission.
 */
export class TasteEventService {
  private readonly models: Db['models'];

  constructor(models: Db['models']) {
    this.models = models;
  }

  async emit(args: {
    userId: string;
    eventType: TasteEventType;
    targetType: TasteTargetType;
    targetId: string;
    contextKey: string;
    contextType?: string;
    contextValue?: string;
    treatment?: string;
    role?: string;
    magnitude?: string;
    sourceStrength?: number;
    attributionConfidence?: number;
    rescueId?: string;
    mealId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TasteEvent> {
    const event = await this.models.TasteEvent.create({
      id: randomUUID(),
      userId: args.userId,
      eventType: args.eventType,
      targetType: args.targetType,
      targetId: args.targetId.toLowerCase(),
      contextKey: args.contextKey,
      contextType: args.contextType ?? null,
      contextValue: args.contextValue ?? null,
      treatment: args.treatment ?? null,
      role: args.role ?? null,
      magnitude: args.magnitude ?? null,
      sourceStrength: args.sourceStrength ?? 0.5,
      attributionConfidence: args.attributionConfidence ?? 0.5,
      rescueId: args.rescueId ?? null,
      mealId: args.mealId ?? null,
      metadata: args.metadata ?? null,
      createdAt: new Date(),
    });

    return event.get() as unknown as TasteEvent;
  }

  async getRecentByUser(
    userId: string,
    options?: { limit?: number; since?: Date; eventType?: TasteEventType },
  ): Promise<TasteEvent[]> {
    const where: Record<string, unknown> = { userId };
    if (options?.eventType) where.eventType = options.eventType;

    const rows = await this.models.TasteEvent.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: options?.limit ?? 50,
    });

    let events = rows.map((r) => r.get() as unknown as TasteEvent);
    if (options?.since) {
      events = events.filter((e) => new Date(e.createdAt) >= options.since!);
    }
    return events;
  }

  async countByTarget(
    userId: string,
    targetType: TasteTargetType,
    targetId: string,
    options?: { withinDays?: number },
  ): Promise<{ recommended: number; completed: number }> {
    const since = options?.withinDays
      ? new Date(Date.now() - options.withinDays * 86400000)
      : undefined;

    const events = await this.getRecentByUser(userId, {
      limit: 100,
      since,
    });

    const relevant = events.filter(
      (e) => e.targetType === targetType && e.targetId === targetId.toLowerCase(),
    );

    return {
      recommended: relevant.filter(
        (e) => e.eventType === 'EXPOSURE_RECOMMENDED',
      ).length,
      completed: relevant.filter(
        (e) => e.eventType === 'EXPOSURE_COMPLETED' || e.eventType === 'MEAL_COMPLETED',
      ).length,
    };
  }
}
