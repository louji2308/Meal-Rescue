import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { MealSlot, UUID } from '@meal-rescue/shared-types';

import { dbModels } from '../database/models';
import { AppError, ErrorCategory } from '../lib/errors';
import { buildServices } from '../services/composition';
import { planPreviewService } from '../services/plan-preview.service';
import type { PlannedDay, PlannedMeal } from '../services/plan-preview.service';
import { PlanningEngine } from '../services/meal-memory/planning-engine';
import type { PlanParams, PlanStrategy } from '../services/meal-memory/planning-engine';
import { dateKeyFor, weekStartFor } from '../services/meal-memory/date-utils';
import { WorldStateService } from '../services/meal-memory/world-state.service';
import { PantryService } from '../services/pantry.service';
import { HouseholdTasteService } from '../services/common-table/household-taste.service';
import { TasteExposureService } from '../services/taste-exposure.service';

const planPreviewSchema = z
  .object({
    text: z.string().min(1).max(2000),
  })
  .strict();

const planConfirmSchema = z
  .object({
    previewId: z.string().uuid(),
    edits: z.string().max(2000).optional(),
  })
  .strict();

const DEFAULT_WEEK_MEAL_SLOTS: MealSlot[] = ['dinner', 'lunch'];

function convertEventsToPlannedDays(
  meals: Array<{ dateKey: string | null; concept: string | null; ingredients: string[] | null; id: UUID; mealSlot: MealSlot }>
): PlannedDay[] {
  const dayMap = new Map<string, PlannedMeal[]>();

  for (const meal of meals) {
    if (!meal.dateKey) continue;

    if (!dayMap.has(meal.dateKey)) {
      dayMap.set(meal.dateKey, []);
    }

    dayMap.get(meal.dateKey)!.push({
      id: meal.id,
      name: meal.concept ?? 'Untitled meal',
      recipeName: meal.concept ?? 'Untitled meal',
      ingredients: meal.ingredients ?? [],
      servings: 1,
      prepTimeMinutes: 15,
      cookTimeMinutes: 0,
      mealSlot: meal.mealSlot,
    });
  }

  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, meals]) => ({ dateKey, meals }));
}

function validationError(message: string): AppError {
  return new AppError({
    category: ErrorCategory.INPUT_VALIDATION,
    code: 'INVALID_PLAN_REVIEW_INPUT',
    message,
    statusCode: 400,
  });
}

/**
 * Plan Review routes — preview and confirm meal plans.
 *
 * POST   /api/v1/meal-memory/plan-preview   generate a plan preview (no persistence)
 * POST   /api/v1/meal-memory/plan-confirm   confirm and save a previewed plan
 */
export async function planReviewRoutes(app: FastifyInstance): Promise<void> {
  const { households } = buildServices(app.redis);

  const householdService = households;

  app.post('/plan-preview', async (request, reply) => {
    const parsed = planPreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError('Body must be {"text": string}');
    }

    const userId = request.user.sub;

    const household = await householdService.getForUser(userId);
    if (!household) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household setup required before planning',
        statusCode: 404,
        recoverable: true,
        suggestedAction: 'Create a household first',
      });
    }

    const householdId = household.id;
    const worldStateService = new WorldStateService(dbModels, {
      pantryService: new PantryService(dbModels),
      householdService,
      householdTasteService: new HouseholdTasteService(dbModels),
      exposureService: new TasteExposureService(dbModels),
    });

    const world = await worldStateService.getState(householdId, userId);

    const todayKey = dateKeyFor(new Date(), 0);
    const weekStart = weekStartFor(todayKey);
    const strategy: PlanStrategy = 'balance';

    const planningEngine = new PlanningEngine(dbModels);

    const params: PlanParams = {
      weekStart,
      mealSlots: DEFAULT_WEEK_MEAL_SLOTS,
      strategy,
      ownerUserId: userId,
      previewMode: true,
    };

    const result = await planningEngine.planWeek(world, params);

    const events = result.plan?.meals ?? [];
    const days = convertEventsToPlannedDays(events);

    const previewResponse = await planPreviewService.generatePreview(userId, {
      days,
      daysPlanned: events.length,
    });

    return reply.send(previewResponse);
  });

  app.post('/plan-confirm', async (request, reply) => {
    const parsed = planConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      throw validationError('Body must be {"previewId": uuid, "edits?"?: string}');
    }

    const { previewId, edits } = parsed.data;

    const result = await planPreviewService.confirmPreview(previewId as UUID, edits);

    return reply.send({ success: result.success });
  });
}
