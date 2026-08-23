import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../config/env';
import { User } from '../database/models/user.model';
import { AppError } from '../lib/errors';
import { timingSafeEqualStr } from '../lib/timing-safe';

/**
 * RevenueCat lifecycle webhook.
 *
 * Server-to-server truth source for subscription state: client purchases
 * are cosmetic until this endpoint flips users.subscription_tier. Auth is
 * a shared bearer secret (RevenueCat dashboard -> Integrations -> Webhooks).
 *
 * Route lives under PUBLIC_ROUTES (skips the JWT hook) because RevenueCat
 * cannot present a user JWT - it authenticates via the shared secret.
 */
const GRANTING_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCEL']);
const REVOKING_EVENTS = new Set(['EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE']);

interface RcWebhookEvent {
  type?: string;
  app_user_id?: string;
  product_id?: string;
}

async function verifySharedSecret(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    throw AppError.internal('REVENUECAT_WEBHOOK_SECRET is not configured');
  }
  const provided = request.headers.authorization ?? '';
  if (!timingSafeEqualStr(provided, `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`)) {
    return reply.status(401).send({ ok: false });
  }
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/webhooks/revenuecat',
    { preValidation: verifySharedSecret },
    async (request, reply) => {
      const event = (request.body as { event?: RcWebhookEvent } | null)?.event;

      // Ack malformed/uninteresting payloads with 200 so RevenueCat's retry
      // machinery does not hammer us; only act on events we understand.
      if (!event?.app_user_id) {
        return reply.status(200).send({ ok: true });
      }

      let tier: SubscriptionTier | null = null;
      if (event.type && GRANTING_EVENTS.has(event.type)) tier = 'pro';
      if (event.type && REVOKING_EVENTS.has(event.type)) tier = 'free';

      if (tier) {
        await User.update({ subscriptionTier: tier }, { where: { id: event.app_user_id } });
      }

      return reply.status(200).send({ ok: true });
    },
  );
}
