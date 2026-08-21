// Side-effect import: pulls in the FastifyRequest.file() type augmentation.
import '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { ErrorCategory, type MealAnalysisResponse } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

const textAnalysisSchema = z.object({
  text: z.string().trim().min(2).max(500),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB pre-optimization cap

/**
 * POST /api/v1/meal/analyze
 *
 * Two input modes, one response contract (MealAnalysisResponse):
 * - multipart/form-data with an `image` file part
 * - application/json {"text": "..."}
 *
 * UX note (product vision): the response includes requiresConfirmation -
 * the client shows "Is that correct? [Yes] [Edit]" instead of a form.
 */
export async function mealRoutes(app: FastifyInstance): Promise<void> {
  const { mealAnalyzer } = buildServices(app.redis);

  app.post('/analyze', async (request, reply) => {
    const contentType = request.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const file = await extractImage(app, request);
      const analysis = await mealAnalyzer.analyzeFromImage(file, request.user.sub);
      return reply.status(201).send(analysis);
    }

    const parsed = textAnalysisSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_ANALYSIS_INPUT',
        message: 'Send either a meal photo (multipart "image" field) or {"text": "<description>"}',
        statusCode: 400,
      });
    }

    const analysis: MealAnalysisResponse = await mealAnalyzer.analyzeFromText(
      parsed.data.text,
      request.user.sub,
    );
    return reply.status(201).send(analysis);
  });
}

async function extractImage(app: FastifyInstance, request: FastifyRequest): Promise<Buffer> {
  const file = await request.file();
  if (!file) {
    throw new AppError({
      category: ErrorCategory.INPUT_VALIDATION,
      code: 'MISSING_IMAGE',
      message: 'Missing image file part',
      statusCode: 400,
      suggestedAction: 'Attach the photo as a multipart "image" field',
    });
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of file.file) {
    total += chunk.length;
    if (total > MAX_IMAGE_BYTES) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'IMAGE_TOO_LARGE',
        message: 'Image too large (max 10 MB)',
        statusCode: 413,
        suggestedAction: 'Upload a smaller photo',
      });
    }
    chunks.push(chunk);
  }
  void app; // logger available if upload metrics are added later
  return Buffer.concat(chunks);
}
