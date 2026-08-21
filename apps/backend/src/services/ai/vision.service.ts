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
import { type VisionResult, visionResultSchema } from './llm-schemas';
import { PROMPT_VERSIONS, VISION_ANALYSIS_SYSTEM_PROMPT } from './prompts';

const CACHE_TTL_SECONDS = 86_400; // 24h per architecture doc

export class VisionService {
  constructor(
    private readonly llm: LlmClient,
    private readonly redis: Redis | null,
  ) {}

  async analyzeImage(imageBuffer: Buffer): Promise<VisionResult & { imageHash: string }> {
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex');

    const cached = await this.readCache(imageHash);
    if (cached) {
      return { ...cached, imageHash };
    }

    const optimized = await this.optimize(imageBuffer);

    let result: VisionResult;
    try {
      const response = await this.llm.completeJson({
        systemPrompt: VISION_ANALYSIS_SYSTEM_PROMPT,
        userContent:
          'Analyze this meal image. Respond ONLY with the JSON schema from your instructions.',
        imageBase64: optimized.toString('base64'),
        schema: visionResultSchema,
        modelName: env.OPENAI_VISION_MODEL,
      });
      result = response.data;
    } catch (err) {
      // Structured AI failure - never leak provider details to clients.
      throw new AppError({
        category: ErrorCategory.AI_MODEL_FAILURE,
        code: 'VISION_ANALYSIS_FAILED',
        message: 'Could not analyze the meal photo',
        statusCode: 502,
        recoverable: true,
        suggestedAction: 'Describe the meal in text instead',
      });
    }

    await this.writeCache(imageHash, result);
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

  private async readCache(imageHash: string): Promise<VisionResult | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(`vision:${imageHash}`);
      if (!raw) return null;
      const parsed = visionResultSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null; // cache is best-effort, never load-bearing
    }
  }

  private async writeCache(imageHash: string, result: VisionResult): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(`vision:${imageHash}`, CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // ignore - see readCache
    }
  }
}

/** Exposed for tests and logging. */
export const VISION_PROMPT_VERSION = PROMPT_VERSIONS.visionAnalysis;
