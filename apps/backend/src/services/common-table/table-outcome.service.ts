import type { CommonTableFeedbackRequest, UUID } from '@meal-rescue/shared-types';
import { ErrorCategory } from '@meal-rescue/shared-types';

import type { Db } from '../../database/models';
import { AppError } from '../../lib/errors';
import { HouseholdTasteService } from './household-taste.service';
import { type CommonTableEventType, TableEventService } from './table-event.service';

const RATING_DELTA = {
  loved: 0.25,
  worked: 0.05,
  not_really: -0.2,
} as const;

/**
 * TableOutcomeService — persists "How did dinner go?" and "What should we
 * remember?" and folds the result back into household preference memory.
 */
export class TableOutcomeService {
  private readonly models: Db['models'];
  private readonly taste: HouseholdTasteService;
  private readonly events: TableEventService;

  constructor(models: Db['models']) {
    this.models = models;
    this.taste = new HouseholdTasteService(models);
    this.events = new TableEventService(models);
  }

  async record(
    userId: UUID,
    sharedMealId: UUID,
    input: CommonTableFeedbackRequest,
  ): Promise<boolean> {
    const meal = await this.models.SharedMeal.findByPk(sharedMealId);
    if (!meal || meal.ownerId !== userId) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'SHARED_MEAL_NOT_FOUND',
        message: 'Shared meal not found',
        statusCode: 404,
        recoverable: true,
      });
    }

    const members = await this.models.SharedMealMember.findAll({
      where: { sharedMealId },
    });
    const memberIds = members.map((m) => m.memberId);

    const sharedIngredients = (meal.ingredients ?? []).filter(
      (name) => !(meal.blockedIngredients ?? []).includes(name),
    );

    // Per-member bonuses: finishes that were actually applied reinforce affinity.
    const perMemberBonuses = new Map<UUID, { ingredient: string; affinity: number }[]>();
    const applied = new Map((input.finishResults ?? []).map((r) => [r.memberId, r.status]));
    for (const finish of meal.finishes ?? []) {
      const status = applied.get(finish.memberId);
      if (status === 'applied' || status === undefined) {
        for (const addition of finish.additions) {
          const list = perMemberBonuses.get(finish.memberId) ?? [];
          list.push({ ingredient: addition, affinity: 0.15 });
          perMemberBonuses.set(finish.memberId, list);
        }
      }
    }

    await this.models.TableOutcome.create({
      sharedMealId,
      submittedBy: userId,
      householdRating: input.householdRating,
      remember: input.remember?.trim() || null,
      memberOutcomes: input.memberOutcomes ?? null,
      finishResults: input.finishResults ?? null,
    });

    await this.taste.applyOutcome({
      memberIds,
      sharedIngredients,
      perMemberIngredientBonuses: perMemberBonuses,
      ratingDelta: RATING_DELTA[input.householdRating],
    });

    await this.events.record(sharedMealId, 'common_table_feedback', {
      rating: input.householdRating,
    });

    return true;
  }

  async recordEvent(
    sharedMealId: UUID,
    eventType: CommonTableEventType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.events.record(sharedMealId, eventType, payload);
  }
}
