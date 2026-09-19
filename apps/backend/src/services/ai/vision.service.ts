/**
 * Vision service - meal photo -> structured analysis.
 *
 * Flow (per implementation plan step 2.1):
 *   sha256(image) -> cache lookup -> sharp resize/compress -> vision model
 *   -> zod validation -> 24h cache write.
 *
 * Cache misses only cost a model call; cache unavailability costs nothing
 * (redis is optional by design).
 */
import { createHash } from 'node:crypto';

import type { Redis } from 'ioredis';
import sharp from 'sharp';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { LlmClient } from './llm-client';
import {
  type KitchenVisionResult,
  kitchenVisionResultSchema,
  type VisionResult,
  visionResultSchema,
} from './llm-schemas';
import {
  PROMPT_VERSIONS,
  buildKitchenVisionPrompt,
  buildVisionAnalysisPrompt,
  type KitchenVisionContext,
} from './prompts';

const CACHE_TTL_SECONDS = 86_400; // 24h per architecture doc

export class VisionService {
  constructor(
    private readonly llm: LlmClient,
    private readonly redis: Redis | null,
  ) {}

  async analyzeImage(
    imageBuffer: Buffer,
    options?: { cuisines?: string[] },
  ): Promise<VisionResult & { imageHash: string }> {
    const cuisines = (options?.cuisines ?? []).map((c) => c.trim()).filter(Boolean);
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');
    const cuisineMarker =
      cuisines.length > 0
        ? `:${createHash('sha256').update(cuisines.join(',')).digest('hex').slice(0, 16)}`
        : '';
    // Cache is scoped by image AND cuisine hints: the same photo analyzed
    // under different soft priors yields different dish names.
    const cacheKey = `vision:${imageHash}${cuisineMarker}`;

    const cached = await this.readCache(cacheKey);
    if (cached) {
      return { ...cached, imageHash };
    }

    const optimized = await this.optimize(imageBuffer);

    let result: VisionResult;
    try {
      const response = await this.llm.completeJson({
        systemPrompt: buildVisionAnalysisPrompt(cuisines),
        userContent:
          'Analyze this meal image. Respond ONLY with the JSON schema from your instructions.',
        imageBase64: optimized.toString('base64'),
        schema: visionResultSchema,
        modelName: env.OPENROUTER_VISION_MODEL,
      });
      result = response.data;
    } catch (err) {
      // Config/auth failures (invalid API key) surface as-is - never mask
      // a key problem as "could not analyze". Everything else becomes a
      // recoverable structured AI failure without leaking provider details.
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError({
        category: ErrorCategory.AI_MODEL_FAILURE,
        code: 'VISION_ANALYSIS_FAILED',
        message: 'Could not analyze the meal photo',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Describe the meal in text instead',
      });
    }

    await this.writeCache(cacheKey, result);
    return { ...result, imageHash };
  }

  /**
   * Kitchen + leftover vision analysis - kitchen tab capture only.
   *
   * Deliberately separate from analyzeImage: the kitchen prompt + JSON
   * style (leftovers/kitchen destinations) differ from the meal recognizer,
   * and both system prompts are maintained independently. The cache is
   * namespaced so the same photo analyzed by the kitchen prompt never
   * collides with the meal-recognizer entry.
   */
  async analyzeKitchenImage(
    imageBuffer: Buffer,
    options?: { cuisines?: string[]; context?: KitchenVisionContext },
  ): Promise<KitchenVisionResult & { imageHash: string }> {
    const cuisines = (options?.cuisines ?? []).map((c) => c.trim()).filter(Boolean);
    const context = options?.context;
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');

    const markerSource = JSON.stringify({
      cuisines,
      captureMode: context?.captureMode,
      purchaseDate: context?.purchaseDate ?? null,
      preparationDate: context?.preparationDate ?? null,
      defaultStorage: context?.defaultStorage ?? null,
    });
    const contextMarker = createHash('sha256')
      .update(markerSource)
      .digest('hex')
      .slice(0, 16);
    const cacheKey = `vision:kitchen:${imageHash}:${contextMarker}`;

    const cached = await this.readKitchenCache(cacheKey);
    if (cached) {
      return { ...cached, imageHash };
    }

    const optimized = await this.optimize(imageBuffer);

    let result: KitchenVisionResult;
    try {
      const response = await this.llm.completeJson({
        systemPrompt: buildKitchenVisionPrompt(cuisines, context),
        userContent:
          'Analyze this kitchen image. Respond ONLY with the JSON schema from your instructions.',
        imageBase64: optimized.toString('base64'),
        schema: kitchenVisionResultSchema,
        modelName: env.OPENROUTER_VISION_MODEL,
      });
      result = response.data;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError({
        category: ErrorCategory.AI_MODEL_FAILURE,
        code: 'KITCHEN_VISION_ANALYSIS_FAILED',
        message: 'Could not analyze the kitchen photo',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Add the items manually instead',
      });
    }

    await this.writeKitchenCache(cacheKey, result);
    return { ...result, imageHash };
  }

  private async optimize(imageBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .resize(1024, 1024, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_IMAGE',
        message: 'Uploaded file is not a valid image',
        statusCode: 400,
        suggestedAction: 'Upload a JPEG or PNG photo of the meal',
      });
    }
  }

  private async readCache(cacheKey: string): Promise<VisionResult | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      const parsed = visionResultSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // cache is best-effort, never load-bearing
    }
  }

  private async writeCache(cacheKey: string, result: VisionResult): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // ignore - see readCache
    }
  }

  private async readKitchenCache(cacheKey: string): Promise<KitchenVisionResult | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) return null;
      const parsed = kitchenVisionResultSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async writeKitchenCache(cacheKey: string, result: KitchenVisionResult): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // ignore
    }
  }
}

/** Exposed for tests and logging. */
export const VISION_PROMPT_VERSION = PROMPT_VERSIONS.visionAnalysis;
export const KITCHEN_VISION_PROMPT_VERSION = PROMPT_VERSIONS.kitchenVision;
