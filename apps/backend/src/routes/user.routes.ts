import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  CULINARY_FAMILIES,
  CULINARY_FAMILY_OPTIONS,
  ErrorCategory,
  type PersonalizationInsight,
} from '@meal-rescue/shared-types';

import { User } from '../database/models/user.model';
import { AppError } from '../lib/errors';
import { buildServices, dbModels } from '../services/composition';

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
      attributes: ['id', 'email', 'subscriptionTier', 'onboardingCompleted'],
    });
    if (!user) {
      throw new AppError({
        category: ErrorCategory.NOT_FOUND,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 404,
      });
    }
    return reply.send({
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      onboardingCompleted: user.onboardingCompleted,
    });
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

  app.get('/taste/onboarding', async (request, reply) => {
    const { mealCompletion } = buildServices(app.redis);
    const userId = request.user.sub;
    const user = await User.findByPk(userId, {
      attributes: ['onboardingCompleted'],
    });
    const state = await mealCompletion.startOnboarding(
      userId,
      user?.onboardingCompleted ?? false,
    );
    return reply.send(state);
  });

  app.post('/taste/onboarding/cuisines', async (request, reply) => {
    const { mealCompletion, tasteMemory } = buildServices(app.redis);
    const userId = request.user.sub;
    const parsed = z
      .object({
        cuisines: z.array(z.enum(CULINARY_FAMILY_OPTIONS)).min(1),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_CUISINE_INPUT',
        message: 'Body must be { cuisines: CulinaryFamily[] }',
        statusCode: 400,
      });
    }
    for (const family of parsed.data.cuisines) {
      await tasteMemory.seedCompass(userId, { family, traditionVsModern: 0 });
    }
    const user = await User.findByPk(userId, {
      attributes: ['onboardingCompleted'],
    });
    const state = await mealCompletion.startOnboarding(
      userId,
      user?.onboardingCompleted ?? false,
    );
    return reply.send(state);
  });

  app.post('/taste/onboarding/answers', async (request, reply) => {
    const { mealCompletion } = buildServices(app.redis);
    const userId = request.user.sub;
    const parsed = z
      .object({
        answer: z.object({
          pairId: z.string().min(1),
          selected: z.enum(['A', 'B']).nullable().default(null),
          unavailableOption: z.enum(['A', 'B']).nullable().default(null),
          rejectionReason: z
            .enum([
              'taste',
              'too_expensive',
              'too_much_effort',
              'don_t_have',
              'don_t_like_ingredient',
              'not_appropriate_for_meal',
              'not_hungry_enough',
            ])
            .optional(),
        }),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_ONBOARDING_INPUT',
        message: 'Body must be { answer: OnboardingAnswer }',
        statusCode: 400,
      });
    }
    if (
      parsed.data.answer.selected === null &&
      parsed.data.answer.unavailableOption === null &&
      parsed.data.answer.rejectionReason === undefined
    ) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_ONBOARDING_INPUT',
        message: 'Answer must select an option, mark one unavailable, or state a reason',
        statusCode: 400,
      });
    }
    const result = await mealCompletion.answerOnboarding(userId, parsed.data.answer);
    if (result.summary) {
      await User.update({ onboardingCompleted: true }, { where: { id: userId } });
    }
    return reply.send(result);
  });

  app.post('/taste/compass', async (request, reply) => {
    const { tasteMemory } = buildServices(app.redis);
    const userId = request.user.sub;
    const parsed = z
      .object({
        family: z.enum(CULINARY_FAMILIES),
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

  app.get('/taste/v2', async (request, reply) => {
    const userId = request.user.sub;
    const {
      tasteSensory,
      tasteTreatment,
      tasteExposure,
      tasteEvents,
      tasteMemory,
    } = buildServices(app.redis);

    const [sensoryBeliefs, treatmentBeliefs, overexposed, recentEvents, journal] =
      await Promise.all([
        tasteSensory.getAllBeliefs(userId),
        tasteTreatment.getAllBeliefs(userId),
        tasteExposure.getOverexposed(userId, 7),
        tasteEvents.getRecentByUser(userId, { limit: 20 }),
        tasteMemory.getJournal(userId),
      ]);

    const combinations = await dbModels.TasteCombination.findAll({
      where: { userId },
      order: [['confidence', 'DESC']],
      limit: 10,
    });

    const sensory = Object.fromEntries(
      [...sensoryBeliefs.entries()].map(([ingredient, beliefs]) => [
        ingredient,
        beliefs.map((b) => ({
          dimension: b.dimension,
          preference: b.preference,
          strength: b.strength,
          sampleCount: b.sampleCount,
        })),
      ]),
    );

    const treatment = Object.fromEntries(
      [...treatmentBeliefs.entries()].map(([ingredient, beliefs]) => [
        ingredient,
        beliefs.map((b) => ({
          treatment: b.treatment,
          preference: b.preference,
          strength: b.strength,
          sampleCount: b.sampleCount,
        })),
      ]),
    );

    return reply.send({
      sensory,
      treatment,
      overexposed,
      recentEvents,
      combinations: combinations.map((c) => ({
        members: c.members,
        affinity: c.affinity,
        confidence: c.confidence,
        observationCount: c.observationCount,
        cuisineContext: c.cuisineContext,
      })),
      journal,
    });
  });
}
