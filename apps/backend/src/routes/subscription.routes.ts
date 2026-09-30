import type { FastifyInstance } from 'fastify';

import { SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import { User } from '../database/models/user.model';
import { AppError, ErrorCategory } from '../lib/errors';

const ENTITLEMENT_ID = 'mealrescue_pro';

/** Client-reported entitlement from react-native-purchases (`getCustomerInfo`). */
interface ClientEntitlement {
  active?: boolean;
  expiresAt?: string | null;
}

/**
 * Whether a client-reported entitlement may stand in when RevenueCat's REST
 * API cannot answer (test-store purchases, missing/invalid REST key).
 * Production never trusts it unless REVENUECAT_ALLOW_CLIENT_ENTITLEMENT=true.
 */
function clientEntitlementAllowed(): boolean {
  const flag = env.REVENUECAT_ALLOW_CLIENT_ENTITLEMENT;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return env.NODE_ENV !== 'production';
}

/**
 * Client-initiated subscription sync.
 *
 * After a RevenueCat purchase or restore, the app calls this endpoint so
 * the backend verifies the entitlement directly with RevenueCat's V1 API
 * and flips subscription_tier in the DB. This covers the gap when webhooks
 * are slow, misconfigured, or not fired (test purchases).
 *
 * When REST verification is impossible but the client sends the SDK's own
 * entitlement verdict (test-store builds), that verdict is accepted instead
 * of failing — the plan gate and the Profile tier read this DB column, so a
 * purchase that never lands here leaves the app claiming Pro while the
 * server still says free. The server answer is authoritative either way:
 * the client only becomes Pro when this route records `tier: 'pro'`.
 */
export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/subscription/sync', async (request, reply) => {
    const userId = request.user.sub;
    const body = (request.body ?? {}) as { entitlement?: ClientEntitlement };
    const clientEntitlement = body.entitlement;
    const canTrustClient = clientEntitlementAllowed() && clientEntitlement != null;

    // 1) Ask RevenueCat when we can.
    let rcTier: SubscriptionTier | null = null;
    if (env.REVENUECAT_API_KEY) {
      const rcRes = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        {
          headers: {
            Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (rcRes.ok) {
        const rcData = (await rcRes.json()) as {
          subscriber?: {
            entitlements?: Record<string, { expires_date?: string | null }>;
          };
        };

        const entitlement = rcData.subscriber?.entitlements?.[ENTITLEMENT_ID];
        const hasEntitlement =
          entitlement != null &&
          (!entitlement.expires_date || new Date(entitlement.expires_date).getTime() > Date.now());
        rcTier = hasEntitlement ? 'pro' : 'free';
      } else if (!canTrustClient) {
        throw new AppError({
          category: ErrorCategory.EXTERNAL_SERVICE_FAILURE,
          code: 'REVENUECAT_API_ERROR',
          message: `RevenueCat API returned ${rcRes.status}`,
          statusCode: 502,
        });
      }
      // else: REST refused (403 on a test/legacy key) — fall through to the
      // SDK verdict the client sent with the purchase.
    } else if (!canTrustClient) {
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

    // 2) Server verdict: RevenueCat when it answered, otherwise the SDK claim.
    let tier: SubscriptionTier;
    let verifiedBy: 'revenuecat' | 'client-entitlement';

    const user = await User.findByPk(userId, { attributes: ['id', 'subscriptionTier'] });
    if (!user) {
      throw AppError.notFound('User');
    }

    if (rcTier !== null) {
      tier = rcTier;
      verifiedBy = 'revenuecat';
    } else {
      const expiresAt = clientEntitlement?.expiresAt;
      const unexpired = !expiresAt || new Date(expiresAt).getTime() > Date.now();
      const active = clientEntitlement?.active === true && unexpired;
      if (!active) {
        // An unverified claim may grant Pro, never revoke it — downgrades
        // belong to RevenueCat (REST verdict / webhook).
        return reply.send({ tier: user.subscriptionTier, verifiedBy: 'client-entitlement' });
      }
      tier = 'pro';
      verifiedBy = 'client-entitlement';
      app.log.warn(
        { userId, verifiedBy, tier },
        'subscription sync: RevenueCat REST unavailable, used SDK entitlement',
      );
    }

    // Update DB — the plan gate, rescues and the Profile tier all read this.
    if (user.subscriptionTier !== tier) {
      await User.update({ subscriptionTier: tier }, { where: { id: userId } });
    }

    return reply.send({ tier, verifiedBy });
  });
}
