import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory } from '@meal-rescue/shared-types';

import { AppError } from '../lib/errors';
import { LeftoverAlchemistService } from '../services/leftover-alchemist.service';

const alchemistSchema = z.object({
  description: z.string().max(500).optional(),
});

/**
 * POST /api/v1/leftover/alchemist
 *
 * "Photograph leftovers -> Transform what exists"
 * Accepts multipart image or text description, returns up to 3 transformations.
 */
export async function leftoverRoutes(app: FastifyInstance): Promise<void> {
  const alchemist = new LeftoverAlchemistService();

  app.post('/alchemist', async (request, reply) => {
    const userId = request.user.sub;

    let image: { uri: string; name: string; mimeType: string } | undefined;
    let description: string | undefined;

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'image') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          image = {
            uri: `data:${part.mimetype};base64,${Buffer.concat(chunks).toString('base64')}`,
            name: part.filename,
            mimeType: part.mimetype,
          };
        } else if (part.type === 'field' && part.fieldname === 'description') {
          description = String(part.value);
        }
      }
    } else {
      const parsed = alchemistSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError({
          category: ErrorCategory.INPUT_VALIDATION,
          code: 'INVALID_ALCHEMIST_INPUT',
          message: 'Provide multipart image or JSON { description? }',
          statusCode: 400,
        });
      }
      description = parsed.data.description;
    }

    if (!image && !description) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'MISSING_ALCHEMIST_INPUT',
        message: 'Provide an image or description of leftovers',
        statusCode: 400,
      });
    }

    const response = await alchemist.alchemize({
      image,
      description,
      userId,
    });

    return reply.status(201).send(response);
  });
}
