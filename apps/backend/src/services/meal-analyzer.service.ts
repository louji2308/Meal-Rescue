/**
 * Meal analyzer - turns raw user input into a persisted, structured
 * MealAnalysis (implementation plan step 2.2).
 *
 * Both entry points converge on the same normalization + persistence so
 * downstream stages never care how the meal was captured.
 */
import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

import type {
  Confidence,
  DetectedIngredient,
  InputType,
  MealAnalysisResponse,
} from '@meal-rescue/shared-types';

import { Meal } from '../database/models/meal.model';
import { findBestMatch } from './ai/ingredient-db';
import type { LlmClient } from './ai/llm-client';
import type { VisionResult } from './ai/llm-schemas';
import { TextExtractionService } from './ai/text-extraction.service';
import { VisionService } from './ai/vision.service';

const CONFIRMATION_UNCERTAINTY_THRESHOLD = 0.7;
const CONFIRMATION_OVERALL_THRESHOLD = 0.75;

export class MealAnalyzerService {
  private readonly vision: VisionService;
  private readonly textExtractor: TextExtractionService;

  constructor(llm: LlmClient, redis: Redis | null) {
    this.vision = new VisionService(llm, redis);
    this.textExtractor = new TextExtractionService(llm);
  }

  async analyzeFromImage(imageBuffer: Buffer, userId: string): Promise<MealAnalysisResponse> {
    const visionResult = await this.vision.analyzeImage(imageBuffer);
    return this.finalize(visionResult, `image:${visionResult.imageHash}`, 'image', userId);
  }

  async analyzeFromText(description: string, userId: string): Promise<MealAnalysisResponse> {
    const extraction = await this.textExtractor.extract(description);
    return this.finalize(extraction, description, 'text', userId);
  }

  private async finalize(
    raw: Pick<VisionResult, 'foods' | 'ingredients' | 'components' | 'uncertainties'>,
    originalInput: string,
    inputType: InputType,
    userId: string,
  ): Promise<MealAnalysisResponse> {
    // Normalize to canonical ingredient names so constraint filtering and
    // candidate generation work off the knowledge base, not free text.
    const normalizedIngredients: DetectedIngredient[] = raw.ingredients.map((ingredient) => {
      const match = findBestMatch(ingredient.name);
      return {
        name: match?.name ?? ingredient.name.toLowerCase(),
        confidence: ingredient.confidence,
        state: ingredient.state,
        estimatedQuantity: ingredient.estimatedQuantity ?? undefined,
      };
    });

    const overallConfidence = computeOverallConfidence(raw.foods.map((food) => food.confidence));
    const requiresConfirmation =
      overallConfidence < CONFIRMATION_OVERALL_THRESHOLD ||
      raw.uncertainties.some((flag) => flag.confidence < CONFIRMATION_UNCERTAINTY_THRESHOLD);

    const mealId = randomUUID();
    await Meal.create({
      id: mealId,
      userId,
      originalInput,
      inputType,
      detectedFoods: raw.foods,
      detectedIngredients: normalizedIngredients,
      detectedComponents: raw.components,
      confidenceScores: { overall: overallConfidence },
    });

    return {
      mealId,
      detectedFoods: raw.foods,
      detectedIngredients: normalizedIngredients,
      detectedComponents: raw.components,
      confidenceScores: { overall: overallConfidence },
      uncertaintyFlags: raw.uncertainties,
      requiresConfirmation,
    };
  }
}

function computeOverallConfidence(confidences: Confidence[]): Confidence {
  if (confidences.length === 0) return 0;
  return Number(
    (confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(3),
  );
}
