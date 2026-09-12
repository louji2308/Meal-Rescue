/**
 * MemoryLearningService — converts a "remember this" or "how did it go?"
 * signal into durable household taste memory.
 *
 * Reuses the V2 taste pipeline (TasteEventService.emit) and the shared-table
 * learner (HouseholdTasteService.applyOutcome) so Meal Memory never grows a
 * parallel preference store: one memory, write-once, learned everywhere.
 */
import type {
  MealEvent,
  MealMemoryFeedbackRequest,
  MealMemoryRememberRequest,
  UUID,
} from '@meal-rescue/shared-types';

import { HouseholdTasteService } from '../common-table/household-taste.service';
import { TasteEventService } from '../taste-event.service';
import { TasteExposureService } from '../taste-exposure.service';

type Sentiment = NonNullable<MealMemoryRememberRequest['sentiment']>;
type FeedbackRating = NonNullable<MealMemoryFeedbackRequest['rating']>;

const SENTIMENT_DELTA: Record<Sentiment, number> = {
  loved: 1,
  liked: 0.5,
  not_for_us: -1,
};

const FEEDBACK_DELTA: Record<FeedbackRating, number> = {
  loved: 1,
  worked: 0.3,
  not_really: -0.7,
};

export class MemoryLearningService {
  private readonly tasteEventService: TasteEventService;
  private readonly householdTasteService: HouseholdTasteService;
  private readonly exposureService: TasteExposureService;

  constructor(deps: {
    tasteEventService: TasteEventService;
    householdTasteService: HouseholdTasteService;
    exposureService: TasteExposureService;
  }) {
    this.tasteEventService = deps.tasteEventService;
    this.householdTasteService = deps.householdTasteService;
    this.exposureService = deps.exposureService;
  }

  async remember(input: {
    ownerUserId: UUID;
    memberIds?: UUID[];
    event: MealEvent;
    sentiment: Sentiment;
    note?: string;
  }): Promise<string[]> {
    const ingredients =
      (input.event.ingredients ?? []).length > 0
        ? input.event.ingredients!
        : input.event.concept
          ? [input.event.concept]
          : [];
    const messages: string[] = [];
    const delta = SENTIMENT_DELTA[input.sentiment];

    for (const ingredient of ingredients) {
      await this.tasteEventService.emit({
        userId: input.ownerUserId,
        eventType: sentimentToTasteEvent(input.sentiment),
        targetType: 'ingredient',
        targetId: ingredient,
        contextKey: 'meal_memory',
        contextValue: input.event.concept ?? undefined,
        magnitude: delta >= 0.6 ? 'large' : delta > 0 ? 'small' : 'moderate',
        sourceStrength: Math.max(0.5, Math.min(1, Math.abs(delta))),
        attributionConfidence: 0.6,
        mealId: input.event.id,
        metadata: { sentiment: input.sentiment, note: input.note ?? null },
      });
    }

    const memberIds =
      input.memberIds && input.memberIds.length > 0 ? input.memberIds : [input.ownerUserId];

    await this.householdTasteService.applyOutcome({
      memberIds,
      sharedIngredients: ingredients,
      perMemberIngredientBonuses: new Map(),
      ratingDelta: delta,
    });

    await this.exposureService.recordCompletion(
      input.ownerUserId,
      'ingredient',
      firstIngredient(ingredients),
    );

    messages.push(
      input.sentiment === 'not_for_us'
        ? `Noted — ${ingredients[0] ?? 'that dish'} won't be pushed for this household anymore.`
        : `Remembered: ${input.sentiment === 'loved' ? 'you loved' : 'you liked'} ${input.event.concept ?? 'that dish'}.`,
    );
    if (ingredients.length > 1) messages.push(`Learned across ${ingredients.length} ingredients.`);

    return messages;
  }

  async feedback(input: {
    ownerUserId: UUID;
    memberIds?: UUID[];
    event: MealEvent;
    rating: FeedbackRating;
    notes?: string;
  }): Promise<void> {
    const ingredients = input.event.ingredients?.length
      ? input.event.ingredients!
      : input.event.concept
        ? [input.event.concept]
        : [];
    const delta = FEEDBACK_DELTA[input.rating];

    for (const ingredient of ingredients) {
      await this.tasteEventService.emit({
        userId: input.ownerUserId,
        eventType: feedbackToTasteEvent(input.rating),
        targetType: 'ingredient',
        targetId: ingredient,
        contextKey: 'meal_memory_feedback',
        contextValue: input.event.concept ?? undefined,
        sourceStrength: input.rating === 'worked' ? 0.5 : 1,
        attributionConfidence: 0.7,
        mealId: input.event.id,
        metadata: { rating: input.rating, notes: input.notes ?? null },
      });
    }

    const memberIds = input.memberIds?.length ? input.memberIds : [input.ownerUserId];
    await this.householdTasteService.applyOutcome({
      memberIds,
      sharedIngredients: ingredients,
      perMemberIngredientBonuses: new Map(),
      ratingDelta: delta,
    });

    if (ingredients.length > 0) {
      await this.exposureService.recordCompletion(input.ownerUserId, 'ingredient', ingredients[0]!);
    }
  }
}

function sentimentToTasteEvent(sentiment: Sentiment): 'EXPLICIT_LIKE' | 'EXPLICIT_DISLIKE' {
  return sentiment === 'not_for_us' ? 'EXPLICIT_DISLIKE' : 'EXPLICIT_LIKE';
}

function firstIngredient(ingredients: string[]): string {
  return ingredients[0] ?? 'dish';
}

function feedbackToTasteEvent(
  rating: FeedbackRating,
): 'SATISFACTION_NAILED' | 'SATISFACTION_ALMOST' | 'SATISFACTION_NOT_FOR_ME' {
  switch (rating) {
    case 'loved':
      return 'SATISFACTION_NAILED';
    case 'worked':
      return 'SATISFACTION_ALMOST';
    case 'not_really':
      return 'SATISFACTION_NOT_FOR_ME';
  }
}
