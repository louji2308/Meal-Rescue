/**
 * V2 OneSignal Aftercare (plan §12, §21-22).
 *
 * Decides whether a completed rescue is eligible for the "Did that hit the
 * spot?" satisfaction check-in push. Rules:
 *   - Only eligible if a MEAL_COMPLETED DecisionEvent exists for the rescue.
 *   - Not eligible if an aftercare check-in was already sent for that rescue
 *     (one aftercare push per rescue max - §22 fatigue control).
 *   - Respect a cooldown period after completion before sending.
 *   - Respect user feedback preference (FEEDBACK_DISABLED).
 *
 * KEYLESS DRY-RUN: when no OneSignal credentials are configured, this MUST NOT
 * crash or make network calls. It logs an explicit `[dry-run]` line and returns
 * eligibility WITHOUT sending. This is guarded behind a config/env key check.
 */
import type { AftercareEligibility, UUID } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import type { Db } from '../../database/models';
import { DecisionEventService } from './decision-events.service';

/** Minimum time after completion before an aftercare check-in may fire. */
export const AFTERCARE_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** Kind recorded when an aftercare check-in push fires for a rescue. */
export const AFTERCARE_EVENT = 'NOTIFICATION_SENT' as const;

/** Whether OneSignal is actually configured (guard for dry-run). */
export function oneSignalEnabled(): boolean {
  return Boolean(env.ONESIGNAL_REST_KEY && env.ONESIGNAL_APP_ID);
}

export class AftercareService {
  private readonly models: Db['models'];
  private readonly events: DecisionEventService;

  constructor(models: Db['models']) {
    this.models = models;
    this.events = new DecisionEventService(models);
  }

  /**
   * Computes eligibility for the aftercare check-in on the given rescue.
   * Throws AppError NOT_FOUND when the rescue does not exist.
   */
  async eligibility(rescueId: UUID, userId: UUID): Promise<AftercareEligibility> {
    const rescue = await this.models.Rescue.findOne({ where: { id: rescueId, userId } });
    if (!rescue) {
      return { eligible: false, reason: 'NO_RESCUE' };
    }

    // Must have been completed first.
    const completed = await this.events.existsForRescue(rescueId, 'MEAL_COMPLETED');
    if (!completed) {
      return { eligible: false, reason: 'NO_RESCUE' };
    }

    // One aftercare push per rescue max.
    const alreadySent = await this.events.countForRescue(rescueId, AFTERCARE_EVENT);
    if (alreadySent > 0) {
      return { eligible: false, reason: 'ALREADY_SENT' };
    }

    // Cooldown: find when the rescue was completed and require that enough
    // time has passed.
    const completion = await this.models.DecisionEvent.findOne({
      where: { rescueId, eventType: 'MEAL_COMPLETED' },
      order: [['createdAt', 'DESC']],
    });
    const completedAt = completion?.createdAt
      ? new Date(completion.createdAt).getTime()
      : rescue.decisionTimestamp
        ? new Date(rescue.decisionTimestamp).getTime()
        : rescue.createdAt
          ? new Date(rescue.createdAt).getTime()
          : Date.now();
    if (Date.now() - completedAt < AFTERCARE_COOLDOWN_MS) {
      return { eligible: false, reason: 'COOLDOWN' };
    }

    // Respect user feedback preference.
    const user = await this.models.User.findByPk(userId, {
      attributes: ['feedbackEnabled'],
    });
    if (user && user.feedbackEnabled === false) {
      return { eligible: false, reason: 'FEEDBACK_DISABLED' };
    }

    if (!oneSignalEnabled()) {
      // KEYLESS DRY-RUN: never crash, never send. Log and return eligible.
      // The misleading name is deliberate: eligibility is about whether we
      // WOULD send; configuration just changes delivery, not eligibility.
      /* eslint-disable no-console */
      console.log(
        JSON.stringify({
          level: 'info',
          msg: '[dry-run] would send aftercare check-in for rescue',
          rescueId,
          userId,
        }),
      );
      /* eslint-enable no-console */
    }

    return { eligible: true, reason: 'OK' };
  }
}
