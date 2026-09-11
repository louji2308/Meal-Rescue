/**
 * Composition root for Phase 2-5 services.
 *
 * Single place where the LLM implementation is chosen and the object
 * graph is wired. Routes receive fully-built services; nothing else in
 * the codebase touches provider SDKs or config directly.
 */
import type { Redis } from 'ioredis';

import { AdditionEvent } from '../database/models/addition-event.model';
import { DecisionEvent } from '../database/models/decision-event.model';
import { Feedback } from '../database/models/feedback.model';
import { Meal } from '../database/models/meal.model';
import { NotificationLog } from '../database/models/notification-log.model';
import { Pantry } from '../database/models/pantry.model';
import { Preference } from '../database/models/preference.model';
import { RescueCreditGrant } from '../database/models/rescue-credit-grant.model';
import { Rescue } from '../database/models/rescue.model';
import { SatisfactionRecordModel } from '../database/models/satisfaction-record.model';
import { TasteEvent } from '../database/models/taste-event.model';
import { TasteExposure } from '../database/models/taste-exposure.model';
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
import { AftercareService } from './v2/aftercare.service';
import { DecisionEventService } from './v2/decision-events.service';
import { DecisionService } from './v2/decision.service';
import { SatisfactionService } from './v2/satisfaction.service';

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
  TasteEvent,
  TasteExposure,
  AdditionEvent,
  SatisfactionRecord: SatisfactionRecordModel,
  DecisionEvent,
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
  satisfaction: SatisfactionService;
  aftercare: AftercareService;
  decision: DecisionService;
} {
  const llm = createLlmClient();
  const tasteMemory = new TasteMemoryService(models);
  const mealCompletion = new MealCompletionService(models);
  const decisionEvents = new DecisionEventService(models);
  return {
    mealAnalyzer: new MealAnalyzerService(llm, redis),
    rescuePipeline: new RescuePipelineService(
      llm,
      pantryProvider,
      tasteMemory,
      mealCompletion,
      decisionEvents,
    ),
    feedback: new FeedbackService(models),
    preferenceLearning: new PreferenceLearningService(models),
    tasteMemory,
    mealCompletion,
    satisfaction: new SatisfactionService(models),
    aftercare: new AftercareService(models),
    decision: new DecisionService(models),
    pantry: new PantryService(models),
    fridgeNegotiator: new FridgeNegotiatorService(),
    leftoverAlchemist: new LeftoverAlchemistService(),
  };
}
