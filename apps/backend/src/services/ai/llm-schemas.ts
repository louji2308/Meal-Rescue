/**
 * Zod schemas validating raw LLM output.
 *
 * These mirror the JSON schemas embedded in prompts.ts. Every AI response
 * passes through one of these before any downstream code touches it -
 * strict structured output is an architecture-doc requirement, not a
 * nice-to-have.
 */
import { z } from 'zod';

const confidence = z.number().min(0).max(1);

export const detectedFoodSchema = z.object({
  name: z.string().min(1).max(120),
  confidence,
});

export const detectedIngredientSchema = z.object({
  name: z.string().min(1).max(120),
  confidence,
  state: z.enum(['raw', 'cooked', 'processed', 'mixed']).catch('mixed'),
  estimatedQuantity: z.string().max(60).nullable().optional(),
});

export const componentAnalysisSchema = z.object({
  protein: z.boolean(),
  fiber_sources: z.boolean(),
  healthy_fat_sources: z.boolean(),
  carbohydrates: z.boolean(),
  sodium_likely_high: z.boolean().default(false),
});

export const uncertaintyFlagSchema = z.object({
  field: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
  confidence,
});

/**
 * Unified capture item - the single struct used for edited review of both
 * meal photos and kitchen captures. Servings only apply to prepared meals
 * and leftovers.
 */
export const recognizedItemSchema = z.object({
  name: z.string().min(1).max(120),
  itemType: z.enum(['INGREDIENT', 'PREPARED_MEAL', 'LEFTOVER', 'PACKAGED_FOOD']).catch('INGREDIENT'),
  confidence,
  quantity: z.number().min(0).nullable().default(null),
  unit: z.enum(['pcs', 'g', 'kg', 'ml', 'l']).nullable().catch(null),
  servings: z.number().int().min(1).max(100).nullable().default(null),
});

export const visionResultSchema = z.object({
  foods: z.array(detectedFoodSchema).max(20),
  components: componentAnalysisSchema,
  uncertainties: z.array(uncertaintyFlagSchema).max(10),
  imageQuality: z.object({
    lighting: z.enum(['good', 'fair', 'poor']).catch('fair'),
    clarity: z.enum(['clear', 'somewhat_clear', 'blurry']).catch('somewhat_clear'),
  }),
});

// ---------------------------------------------------------------------------
// Kitchen + Leftover vision (separate JSON style from the meal recognizer)
// ---------------------------------------------------------------------------

export const kitchenStorageSchema = z
  .enum(['REFRIGERATED', 'FROZEN', 'ROOM_TEMPERATURE', 'PANTRY', 'UNKNOWN'])
  .catch('UNKNOWN');

export const printedDateSchema = z.object({
  type: z
    .enum(['EXPIRY', 'USE_BY', 'BEST_BEFORE', 'SELL_BY', 'MANUFACTURING', 'UNKNOWN'])
    .catch('UNKNOWN'),
  date: z.string().nullable().catch(null),
  confidence,
});

export const expectedUseBySchema = z.object({
  startDate: z.string().nullable().catch(null),
  endDate: z.string().nullable().catch(null),
  confidence,
  basis: z.string().max(300).catch(''),
});

const kitchenFoodStateSchema = z
  .enum(['raw', 'cooked', 'processed', 'packaged', 'unknown'])
  .catch('unknown');

/** A prepared / cooked dish being stored (destination: leftovers). */
export const kitchenLeftoverSchema = z.object({
  name: z.string().min(1).max(120),
  itemType: z.literal('LEFTOVER').catch('LEFTOVER'),
  confidence,
  state: kitchenFoodStateSchema,
  storage: kitchenStorageSchema,
  printedDate: printedDateSchema,
  expectedUseBy: expectedUseBySchema,
});

/** A standalone food item for the pantry/fridge/freezer (destination: kitchen). */
export const kitchenItemSchema = z.object({
  name: z.string().min(1).max(120),
  itemType: z
    .enum(['INGREDIENT', 'PACKAGED_FOOD', 'OTHER_FOOD'])
    .catch('INGREDIENT'),
  confidence,
  state: kitchenFoodStateSchema,
  storage: kitchenStorageSchema,
  printedDate: printedDateSchema,
  expectedUseBy: expectedUseBySchema,
});

export const kitchenVisionResultSchema = z.object({
  leftovers: z.array(kitchenLeftoverSchema).max(20),
  kitchen: z.array(kitchenItemSchema).max(30),
  uncertainties: z.array(uncertaintyFlagSchema).max(10),
  imageQuality: z.object({
    lighting: z.enum(['good', 'fair', 'poor']).catch('fair'),
    clarity: z.enum(['clear', 'somewhat_clear', 'blurry']).catch('somewhat_clear'),
  }),
});

export const textExtractionSchema = z.object({
  foods: z.array(detectedFoodSchema).max(20),
  ingredients: z.array(detectedIngredientSchema).max(40),
  components: componentAnalysisSchema,
  uncertainties: z.array(uncertaintyFlagSchema).max(10),
});

export const rankedCandidateSchema = z.object({
  candidateId: z.string().min(1),
  overallScore: confidence.catch(0.5),
  reasoning: z.string().max(1000).catch(''),
  explanation: z.string().max(1000).catch(''),
});

export const rankingResultSchema = z.object({
  rankedCandidates: z.array(rankedCandidateSchema).min(1),
  rankingConfidence: confidence.catch(0.5),
});

export type VisionResult = z.infer<typeof visionResultSchema>;
export type KitchenVisionResult = z.infer<typeof kitchenVisionResultSchema>;
export type KitchenLeftover = z.infer<typeof kitchenLeftoverSchema>;
export type KitchenItem = z.infer<typeof kitchenItemSchema>;
export type TextExtractionResult = z.infer<typeof textExtractionSchema>;
export type RankingResult = z.infer<typeof rankingResultSchema>;
export type RecognizedItem = z.infer<typeof recognizedItemSchema>;

export const reasoningSchema = z.object({
  reasoning: z.string().min(1).max(2000),
});
