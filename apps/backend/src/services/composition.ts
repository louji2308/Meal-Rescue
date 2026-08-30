/**
 * Composition root for Phase 2-5 services.
 *
 * Single place where the LLM implementation is chosen and the object
 * graph is wired. Routes receive fully-built services; nothing else in
 * the codebase touches provider SDKs or config directly.
 */
import type { Redis } from 'ioredis';

import { AdditionEvent } from '../database/models/addition-event.model';
import { Feedback } from '../database/models/feedback.model';
import { Meal } from '../database/models/meal.model';
import { NotificationLog } from '../database/models/notification-log.model';
import { Pantry } from '../database/models/pantry.model';
import { Preference } from '../database/models/preference.model';
import { RescueCreditGrant } from '../database/models/rescue-credit-grant.model';
import { Rescue } from '../database/models/rescue.model';
import { TasteMemory } from '../database/models/taste-memory.model';
import { User } from '../database/models/user.model';
import { createLlmClient } from './ai/llm-factory';
import { FeedbackService } from './feedback.service';
import { FridgeNegotiatorService } from './fridge-negotiator.service';
import { LeftoverAlchemistService } from './leftover-alchemist.service';
import { MealAnalyzerService } from './meal-analyzer.service';
import { MealCompletionService } from './meal-completion.service';
import { PantryService } from './pantry.service';
import { PreferenceLearningService } from './preference-learning.service';
import { type PantryProvider, RescuePipelineService } from './rescue-pipeline.service';
import { TasteMemoryService } from './taste-memory.service';

const pantryProvider: PantryProvider = {
  async getPantryItemNames(userId: string): Promise<string[]> {
    const rows = await Pantry.findAll({
      where: { userId },
      attributes: ['ingredientName'],
    });
    return rows.map((row) => row.ingredientName);
  },
  async getFullPantry(userId: string) {
    const rows = await Pantry.findAll({
      where: { userId },
      order: [['addedAt', 'DESC']],
    });
    return rows.map((row) => row.get({ plain: true }));
  },
};

const models = {
  Pantry,
  Preference,
  Feedback,
  Rescue,
  Meal,
  User,
  RescueCreditGrant,
  NotificationLog,
  TasteMemory,
  AdditionEvent,
};

export function buildServices(redis: Redis | null): {
  mealAnalyzer: MealAnalyzerService;
  rescuePipeline: RescuePipelineService;
  feedback: FeedbackService;
  preferenceLearning: PreferenceLearningService;
  tasteMemory: TasteMemoryService;
  pantry: PantryService;
  fridgeNegotiator: FridgeNegotiatorService;
  leftoverAlchemist: LeftoverAlchemistService;
  mealCompletion: MealCompletionService;
} {
  const llm = createLlmClient();
  const tasteMemory = new TasteMemoryService(models);
  return {
    mealAnalyzer: new MealAnalyzerService(llm, redis),
    rescuePipeline: new RescuePipelineService(llm, pantryProvider, tasteMemory),
    feedback: new FeedbackService(models),
    preferenceLearning: new PreferenceLearningService(models),
    tasteMemory,
    pantry: new PantryService(models),
    fridgeNegotiator: new FridgeNegotiatorService(),
    leftoverAlchemist: new LeftoverAlchemistService(),
    mealCompletion: new MealCompletionService(models),
  };
}
