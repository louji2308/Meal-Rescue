/**
 * Composition root for Phase 2-5 services.
 *
 * Single place where the LLM implementation is chosen and the object
 * graph is wired. Routes receive fully-built services; nothing else in
 * the codebase touches provider SDKs or config directly.
 */
import type { Redis } from 'ioredis';

import { dbModels } from '../database/models';
import { Pantry } from '../database/models/pantry.model';
import { createLlmClient, createVisionLlmClient } from './ai/llm-factory';
import { CommonTableService } from './common-table/common-table.service';
import { HouseholdMemberService } from './common-table/household-member.service';
import { HouseholdTasteService } from './common-table/household-taste.service';
import { HouseholdService } from './common-table/household.service';
import { ContextSignalService } from './context-signal.service';
import { CuisineCompatibilityService } from './cuisine-compatibility.service';
import { FeedbackService } from './feedback.service';
import { LeftoverAlchemistService } from './leftover-alchemist.service';
import { MealAnalyzerService } from './meal-analyzer.service';
import { MealCompletionService } from './meal-completion.service';
import { AccountingService } from './meal-memory/accounting.service';
import { AiPlannerService } from './meal-memory/ai-planner.service';
import { MealIntelligenceService } from './meal-memory/meal-intelligence.service';
import { MealMemoryAiService } from './meal-memory/meal-memory-ai.service';
import { MealMemoryService } from './meal-memory/meal-memory.service';
import { MemoryLearningService } from './meal-memory/memory-learning.service';
import { PlanningEngine } from './meal-memory/planning-engine';
import { WorldStateService } from './meal-memory/world-state.service';
import { ModificationMagnitudeService } from './modification-magnitude.service';
import { OnboardingPrefContextService } from './onboarding-pref-context.service';
import { OnboardingPreferencesService } from './onboarding/onboarding-preferences.service';
import { PantryService } from './pantry.service';
import { PreferenceLearningService } from './preference-learning.service';
import { type PantryProvider, RescuePipelineService } from './rescue-pipeline.service';
import { RescueTasteContextBuilder } from './rescue-taste-context.service';
import { TasteEventService } from './taste-event.service';
import { TasteExposureService } from './taste-exposure.service';
import { TasteJournalService } from './taste-journal/taste-journal.service';
import { TasteMemoryService } from './taste-memory.service';
import { TasteSensoryService } from './taste-sensory.service';
import { TasteTreatmentService } from './taste-treatment.service';
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

// The full model registry from database/models — every service sees every
// table, so adding a model never breaks an existing constructor.
const models = dbModels;

export { models as dbModels };

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
  rescueTasteContext: RescueTasteContextBuilder;
  pantry: PantryService;
  leftoverAlchemist: LeftoverAlchemistService;
  mealCompletion: MealCompletionService;
  satisfaction: SatisfactionService;
  aftercare: AftercareService;
  decision: DecisionService;
  commonTable: CommonTableService;
  households: HouseholdService;
  householdMembers: HouseholdMemberService;
  mealMemory: MealMemoryService;
  mealIntelligence: MealIntelligenceService;
  aiPlanner: AiPlannerService;
  tasteJournal: TasteJournalService;
  onboarding: OnboardingPreferencesService;
} {
  const llm = createLlmClient();
  const visionLlm = createVisionLlmClient();
  const tasteMemory = new TasteMemoryService(models);
  const tasteEvents = new TasteEventService(models);
  const tasteExposure = new TasteExposureService(models);
  const tasteSensory = new TasteSensoryService(models);
  const tasteTreatment = new TasteTreatmentService(models);
  const cuisineCompatibility = new CuisineCompatibilityService(models);
  const modificationMagnitude = new ModificationMagnitudeService(models);
  const rescueTasteContext = new RescueTasteContextBuilder(
    models,
    tasteSensory,
    tasteTreatment,
    cuisineCompatibility,
    modificationMagnitude,
    tasteExposure,
    tasteEvents,
  );
  const mealCompletion = new MealCompletionService(models);
  const decisionEvents = new DecisionEventService(models);

  const householdService = new HouseholdService(dbModels);
  const householdTasteService = new HouseholdTasteService(dbModels);
  const tasteEventService = new TasteEventService(dbModels);
  const pantryService = new PantryService(models);
  const worldStateService = new WorldStateService(dbModels, {
    pantryService,
    householdService,
    householdTasteService,
    exposureService: tasteExposure,
  });
  const planningEngine = new PlanningEngine(dbModels);
  const memoryLearningService = new MemoryLearningService({
    tasteEventService,
    householdTasteService,
    exposureService: tasteExposure,
  });
  const accountingService = new AccountingService(dbModels);
  const aiService = new MealMemoryAiService(llm);
  const mealMemoryService = new MealMemoryService({
    models: dbModels,
    worldStateService,
    planningEngine,
    memoryLearningService,
    accountingService,
    householdService,
    aiService,
  });
  const mealIntelligenceService = new MealIntelligenceService({
    worldStateService,
    planningEngine,
    householdService,
    aiService,
  });
  const aiPlannerService = new AiPlannerService(llm, worldStateService, householdService);

  return {
    mealAnalyzer: new MealAnalyzerService(llm, redis, visionLlm),
    rescuePipeline: new RescuePipelineService(
      llm,
      pantryProvider,
      tasteMemory,
      mealCompletion,
      decisionEvents,
      new OnboardingPrefContextService(dbModels),
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
    rescueTasteContext,
    mealCompletion,
    satisfaction: new SatisfactionService(models),
    aftercare: new AftercareService(models),
    decision: new DecisionService(models),
    pantry: pantryService,
    leftoverAlchemist: new LeftoverAlchemistService(),
    commonTable: new CommonTableService(dbModels, llm, redis, visionLlm),
    households: householdService,
    householdMembers: new HouseholdMemberService(dbModels),
    mealMemory: mealMemoryService,
    mealIntelligence: mealIntelligenceService,
    aiPlanner: aiPlannerService,
    tasteJournal: new TasteJournalService(models),
    onboarding: new OnboardingPreferencesService(
      models,
      new TasteJournalService(models),
      tasteMemory,
    ),
  };
}
