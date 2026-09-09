import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { closeDatabase, initializeDatabase, sequelize } from '../src/database';
import { AdditionEvent } from '../src/database/models/addition-event.model';
import { DecisionEvent } from '../src/database/models/decision-event.model';
import { Feedback } from '../src/database/models/feedback.model';
import { Meal } from '../src/database/models/meal.model';
import { NotificationLog } from '../src/database/models/notification-log.model';
import { Pantry } from '../src/database/models/pantry.model';
import { Preference } from '../src/database/models/preference.model';
import { RescueCreditGrant } from '../src/database/models/rescue-credit-grant.model';
import { Rescue } from '../src/database/models/rescue.model';
import { SatisfactionRecordModel } from '../src/database/models/satisfaction-record.model';
import { TasteMemory } from '../src/database/models/taste-memory.model';
import { User } from '../src/database/models/user.model';
import { HeuristicLlmClient } from '../src/services/ai/heuristic-llm-client';
import { MealCompletionService } from '../src/services/meal-completion.service';
import { RescuePipelineService } from '../src/services/rescue-pipeline.service';
import { TasteMemoryService } from '../src/services/taste-memory.service';

const hasDb = Boolean(process.env.TEST_DATABASE_URL);

const integrationModels = {
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
  SatisfactionRecord: SatisfactionRecordModel,
  DecisionEvent,
} as const;

const describeDb = hasDb ? describe : describe.skip;

describeDb('ranking pipeline wiring', () => {
  beforeAll(async () => {
    await initializeDatabase();
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedUser() {
    return User.create({
      id: randomUUID(),
      email: `rank-${randomUUID()}@mealrescue.test`,
      passwordHash: null,
      subscriptionTier: 'free',
      rescueCredits: 0,
      locale: 'en-US',
      tzOffsetMinutes: 0,
    });
  }

  async function seedMeal(userId: string) {
    return Meal.create({
      id: randomUUID(),
      userId,
      originalInput: 'instant noodles',
      inputType: 'text',
      detectedFoods: [{ name: 'instant noodles', confidence: 0.9 }],
      detectedIngredients: [{ name: 'wheat noodles', confidence: 0.9, state: 'cooked' }],
      detectedComponents: { protein: false },
    });
  }

  it('runs end-to-end deterministically, persists pipeline:v2, and reads last rescues for anti-fatigue', async () => {
    const user = await seedUser();
    const meal = await seedMeal(user.id);
    const tasteMemory = new TasteMemoryService(integrationModels);
    const mealCompletion = new MealCompletionService(integrationModels);
    const pipeline = new RescuePipelineService(
      new HeuristicLlmClient(),
      null,
      tasteMemory,
      mealCompletion,
    );

    const first = await pipeline.generateRescue(meal.id, user.id, {});
    expect(first.recommendation).toBeDefined();
    expect(first.alternatives.length).toBeLessThanOrEqual(2);
    expect(first.actions).toEqual(['rescue', 'swap', 'dont_have', 'keep_as_is']);

    const persisted = await Rescue.findOne({ where: { mealId: meal.id, userId: user.id } });
    expect(persisted?.modelVersion).toBe('pipeline:v2');
    expect(persisted?.candidatesGenerated).toBeDefined();
    expect(
      (persisted?.selectedRecommendation as { candidate?: { additions?: unknown[] } })?.candidate
        ?.additions,
    ).toBeDefined();

    // Second rescue: the previous top pick is now in "recently shown" and
    // the pipeline still completes without error.
    const second = await pipeline.generateRescue(meal.id, user.id, {});
    expect(second.recommendation).toBeDefined();

    const nowShown = await (
      pipeline as unknown as {
        recentlyShownAdditions: (userId: string) => Promise<string[]>;
      }
    ).recentlyShownAdditions(user.id);
    expect(nowShown.length).toBeGreaterThan(0);
  });

  it('getRankingInputs returns the honest zero-default before any onboarding', async () => {
    const user = await seedUser();
    const mealCompletion = new MealCompletionService(integrationModels);
    const inputs = await mealCompletion.getRankingInputs(user.id);
    expect(inputs.mealGroupAffinities).toEqual({});
    expect(inputs.profileConfidence).toBe(0);
    expect(inputs.coldStartFactors).toHaveLength(5);
    for (const factor of inputs.coldStartFactors) {
      expect(factor.affinity).toBe(0);
      expect(factor.confidence).toBe('unknown');
    }
    expect(new Set(inputs.coldStartFactors.map((factor) => factor.factor)).size).toBe(5);
  });
});
