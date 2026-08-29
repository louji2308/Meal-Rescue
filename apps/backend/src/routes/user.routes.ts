import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ErrorCategory, type PersonalizationInsight } from '@meal-rescue/shared-types';

import { User } from '../database/models/user.model';
import { AppError } from '../lib/errors';
import { buildServices } from '../services/composition';

/**
 * GET /api/v1/user/preferences - learned preferences with confidence
 * GET /api/v1/user/insights - personalization insights from feedback
 */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  const { preferenceLearning } = buildServices(app.redis);

  app.get('/preferences', async (request, reply) => {
    const userId = request.user.sub;
    const prefs = await preferenceLearning.getLearnedPreferences(userId);
    return reply.send(prefs);
  });

  app.get('/insights', async (request, reply) => {
    const userId = request.user.sub;
    const prefs = await preferenceLearning.getLearnedPreferences(userId);

    const insights: PersonalizationInsight[] = [];

    const favorites = prefs.filter((p) => p.preferenceType === 'favorite_ingredient');
    if (favorites.length > 0) {
      insights.push({
        type: 'favorite_ingredient',
        description: `You consistently enjoy: ${favorites
          .slice(0, 3)
          .map((f) => f.preferenceKey)
          .join(', ')}`,
        confidence: Math.max(...favorites.map((f) => f.confidenceScore)),
      });
    }

    const avoided = prefs.filter((p) => p.preferenceType === 'avoided_ingredient');
    if (avoided.length > 0) {
      insights.push({
        type: 'avoided_ingredient',
        description: `You tend to skip: ${avoided
          .slice(0, 3)
          .map((a) => a.preferenceKey)
          .join(', ')}`,
        confidence: Math.max(...avoided.map((a) => a.confidenceScore)),
      });
    }

    const prep = prefs.find((p) => p.preferenceType === 'prep_tolerance');
    if (prep) {
      insights.push({
        type: 'prep_tolerance',
        description: `Your prep tolerance is ${prep.preferenceKey}`,
        confidence: prep.confidenceScore,
      });
    }

    const time = prefs.find((p) => p.preferenceType === 'time_pattern');
    if (time) {
      insights.push({
        type: 'time_pattern',
        description: `You often need ${time.preferenceKey} meals`,
        confidence: time.confidenceScore,
      });
    }

    return reply.send(insights);
  });

  app.get('/me', async (request, reply) => {
    const userId = request.user.sub;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'subscriptionTier'],
    });
    if (!user) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 404,
      });
    }
    return reply.send({ id: user.id, email: user.email, subscriptionTier: user.subscriptionTier });
  });

  app.get('/taste/profile', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    return reply.send(await tasteMemory.getTasteProfile(request.user.sub));
  });

  app.get('/taste/personality', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    return reply.send(await tasteMemory.buildPersonality(request.user.sub));
  });

  app.get('/taste/journal', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    return reply.send(await tasteMemory.getJournal(request.user.sub));
  });

  app.get('/taste', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    const userId = request.user.sub;
    const [memories, personality, journal] = await Promise.all([
      tasteMemory.getTasteProfile(userId),
      tasteMemory.buildPersonality(userId),
      tasteMemory.getJournal(userId),
    ]);
    return reply.send({ memories, personality, journal });
  });

  app.get('/taste/culture', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    const userId = request.user.sub;
    const affinities = await tasteMemory.getCuisineAffinities(userId);
    const traditionVsModern = await tasteMemory.getTraditionVsModern(userId);
    return reply.send({
      affinities: Object.fromEntries(affinities),
      traditionVsModern,
      seeded: affinities.size > 0,
    });
  });

  app.post('/taste/compass', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    const userId = request.user.sub;
    const parsed = z
      .object({
        family: z.enum([
          'indian',
          'east_asian',
          'mediterranean',
          'mexican',
          'american',
          'middle_eastern',
          'italian',
          'none',
        ]),
        traditionVsModern: z.number().min(-1).max(1).default(0),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_COMPASS_INPUT',
        message: 'Body must be { family, traditionVsModern? }',
        statusCode: 400,
      });
    }
    await tasteMemory.seedCompass(userId, {
      family: parsed.data.family,
      traditionVsModern: parsed.data.traditionVsModern,
    });
    return reply.send({ ok: true });
  });
}
