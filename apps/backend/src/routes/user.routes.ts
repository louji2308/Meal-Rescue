import type { FastifyInstance } from 'fastify';

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
}
