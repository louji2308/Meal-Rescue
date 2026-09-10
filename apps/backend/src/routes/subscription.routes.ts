import type { FastifyInstance } from 'fastify';

import { SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import { User } from '../database/models/user.model';
import { AppError, ErrorCategory } from '../lib/errors';

const ENTITLEMENT_ID = 'mealrescue_pro';

/**
 * Client-initiated subscription sync.
 *
 * After a RevenueCat purchase or restore, the app calls this endpoint so
 * the backend verifies the entitlement directly with RevenueCat's V1 API
 * and flips subscription_tier in the DB. This covers the gap when webhooks
 * are slow, misconfigured, or not fired (test purchases).
 */
export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/subscription/sync', async (request, reply) => {
    if (!env.REVENUECAT_API_KEY) {
      return reply.status(503).send({
        success: false,
        error: {
          category: ErrorCategory.EXTERNAL_SERVICE_FAILURE,
          code: 'REVENUECAT_NOT_CONFIGURED',
          message: 'RevenueCat API key is not configured on the server',
          recoverable: false,
        },
      });
    }

    const userId = request.user.sub;

    // Fetch subscriber from RevenueCat using the app user id
    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!rcRes.ok) {
      throw new AppError({
        category: ErrorCategory.EXTERNAL_SERVICE_FAILURE,
        code: 'REVENUECAT_API_ERROR',
        message: `RevenueCat API returned ${rcRes.status}`,
        statusCode: 502,
      });
    }

    const rcData = (await rcRes.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };

    const entitlement = rcData.subscriber?.entitlements?.[ENTITLEMENT_ID];
    const hasEntitlement =
      entitlement != null &&
      (!entitlement.expires_date || new Date(entitlement.expires_date).getTime() > Date.now());

    const tier: SubscriptionTier = hasEntitlement ? 'pro' : 'free';

    // Update DB
    const [updated] = await User.update({ subscriptionTier: tier }, { where: { id: userId } });
    if (updated === 0) {
      throw AppError.notFound('User');
    }

    return reply.send({ tier });
  });
}
