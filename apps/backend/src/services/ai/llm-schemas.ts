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
  state: z.enum(['raw', 'cooked', 'processed', 'mixed']),
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

export const visionResultSchema = z.object({
  foods: z.array(detectedFoodSchema).max(20),
  ingredients: z.array(detectedIngredientSchema).max(40),
  components: componentAnalysisSchema,
  uncertainties: z.array(uncertaintyFlagSchema).max(10),
  imageQuality: z
    .object({
      lighting: z.enum(['good', 'fair', 'poor']).catch('fair'),
      clarity: z.enum(['clear', 'somewhat_clear', 'blurry']).catch('somewhat_clear'),
    })
    .optional(),
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
export type TextExtractionResult = z.infer<typeof textExtractionSchema>;
export type RankingResult = z.infer<typeof rankingResultSchema>;
