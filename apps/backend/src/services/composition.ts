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
import { TasteCombination } from '../database/models/taste-combination.model';
import { TasteEvent } from '../database/models/taste-event.model';
import { TasteSensoryPreference } from '../database/models/taste-sensory-preference.model';
import { TasteTreatmentPreference } from '../database/models/taste-treatment-preference.model';
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
import { TasteEventService } from './taste-event.service';
import { TasteExposureService } from './taste-exposure.service';
import { TasteMemoryService } from './taste-memory.service';
import { TasteSensoryService } from './taste-sensory.service';
import { TasteTreatmentService } from './taste-treatment.service';
import { CuisineCompatibilityService } from './cuisine-compatibility.service';
import { ModificationMagnitudeService } from './modification-magnitude.service';
import { ContextSignalService } from './context-signal.service';
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
  TasteCombination,
  TasteSensoryPreference,
  TasteTreatmentPreference,
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
  tasteEvents: TasteEventService;
  tasteExposure: TasteExposureService;
  tasteSensory: TasteSensoryService;
  tasteTreatment: TasteTreatmentService;
  cuisineCompatibility: CuisineCompatibilityService;
  modificationMagnitude: ModificationMagnitudeService;
  contextSignal: typeof ContextSignalService;
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
  const tasteEvents = new TasteEventService(models);
  const tasteExposure = new TasteExposureService(models);
  const tasteSensory = new TasteSensoryService(models);
  const tasteTreatment = new TasteTreatmentService(models);
  const cuisineCompatibility = new CuisineCompatibilityService(models);
  const modificationMagnitude = new ModificationMagnitudeService(models);
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
    feedback: new FeedbackService(models, tasteEvents, tasteSensory, tasteTreatment),
    preferenceLearning: new PreferenceLearningService(models),
    tasteMemory,
    tasteEvents,
    tasteExposure,
    tasteSensory,
    tasteTreatment,
    cuisineCompatibility,
    modificationMagnitude,
    contextSignal: ContextSignalService,
    mealCompletion,
    satisfaction: new SatisfactionService(models),
    aftercare: new AftercareService(models),
    decision: new DecisionService(models),
    pantry: new PantryService(models),
    fridgeNegotiator: new FridgeNegotiatorService(),
    leftoverAlchemist: new LeftoverAlchemistService(),
  };
}
