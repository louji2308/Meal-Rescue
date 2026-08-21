/**
 * Composition root for Phase 2 services.
 *
 * Single place where the LLM implementation is chosen and the object
 * graph is wired. Routes receive fully-built services; nothing else in
 * the codebase touches provider SDKs or config directly.
 */
import type { Redis } from 'ioredis';

import { Pantry } from '../database/models/pantry.model';
import { createLlmClient } from './ai/llm-factory';
import { MealAnalyzerService } from './meal-analyzer.service';
import { type PantryProvider, RescuePipelineService } from './rescue-pipeline.service';

const pantryProvider: PantryProvider = {
  async getPantryItemNames(userId: string): Promise<string[]> {
    const rows = await Pantry.findAll({
      where: { userId },
      attributes: ['ingredientName'],
    });
    return rows.map((row) => row.ingredientName);
  },
};

export function buildServices(redis: Redis | null): {
  mealAnalyzer: MealAnalyzerService;
  rescuePipeline: RescuePipelineService;
} {
  const llm = createLlmClient();
  return {
    mealAnalyzer: new MealAnalyzerService(llm, redis),
    rescuePipeline: new RescuePipelineService(llm, pantryProvider),
  };
}
