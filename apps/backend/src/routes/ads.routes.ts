import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { RATE_LIMITS } from '../config/constants';
import { User } from '../database/models/user.model';
import { AppError, ErrorCategory } from '../lib/errors';
import {
  countRescuesSince,
  effectiveTier,
  grantCredits,
  grantProPass,
  hasAdCapLeft,
  startOfLocalDay,
} from '../services/rescue-allowance.service';

const claimSchema = z.object({
  adTransactionId: z.string().min(8).max(255),
});

const FUEL_CREDITS = 2;
const PRO_PASS_MINUTES = 60;

/**
 * Ads eligibility + reward claims.
 *
 * Governance invariants:
 * - Subscribers NEVER enter ad surfaces (eligibility returns false and
 *   claims are rejected with ADS_NOT_ELIGIBLE).
 * - Every claim is idempotent per ad transaction id (unique grant ledger).
 */
export async function adsRoutes(app: FastifyInstance): Promise<void> {
  async function requireFreeUser(userId: string): Promise<User> {
    const user = await User.findByPk(userId);
    if (!user) throw AppError.notFound('User');
    if (effectiveTier(user) === 'pro') {
      throw new AppError({
        category: ErrorCategory.FORBIDDEN,
        code: 'ADS_NOT_ELIGIBLE',
        message: 'Subscribers never see ads',
        statusCode: 403,
      });
    }
    return user;
  }

  app.get('/eligibility', async (request) => {
    const user = await User.findByPk(request.user.sub);
    if (!user) throw AppError.notFound('User');
    const tier = effectiveTier(user);
    if (tier === 'pro') {
      return {
        tier,
        rescuesToday: null,
        dailyLimit: null,
        rescueCredits: 0,
        canWatchRescueFuel: false,
        canWatchProPass: false,
      };
    }
    const rescuesToday = await countRescuesSince(
      user.id,
      startOfLocalDay(user.tzOffsetMinutes ?? 0),
    );
    return {
      tier,
      rescuesToday,
      dailyLimit: RATE_LIMITS.free.rescuesPerDay,
      rescueCredits: user.rescueCredits ?? 0,
      canWatchRescueFuel: true,
      canWatchProPass: true,
    };
  });

  app.post('/rewards/rescue-fuel', async (request, reply) => {
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_AD_CLAIM',
        message: 'Body must be {"adTransactionId": string}',
        statusCode: 400,
      });
    }
    const user = await requireFreeUser(request.user.sub);
    if (!(await hasAdCapLeft(user))) {
      throw new AppError({
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        code: 'DAILY_AD_LIMIT',
        message: 'Rewarded ad limit reached for today',
        statusCode: 429,
        recoverable: true,
        suggestedAction: 'Upgrade to Pro for unlimited rescues',
      });
    }
    const granted = await grantCredits(user.id, parsed.data.adTransactionId, FUEL_CREDITS);
    const fresh = await User.findByPk(user.id);
    return reply.status(granted ? 201 : 200).send({
      granted,
      rescueCredits: fresh?.rescueCredits ?? 0,
    });
  });

  app.post('/rewards/pro-pass', async (request, reply) => {
    const parsed = claimSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError({
        category: ErrorCategory.INPUT_VALIDATION,
        code: 'INVALID_AD_CLAIM',
        message: 'Body must be {"adTransactionId": string}',
        statusCode: 400,
      });
    }
    const user = await requireFreeUser(request.user.sub);
    if (!(await hasAdCapLeft(user))) {
      throw new AppError({
        category: ErrorCategory.RATE_LIMIT_EXCEEDED,
        code: 'DAILY_AD_LIMIT',
        message: 'Rewarded ad limit reached for today',
        statusCode: 429,
        recoverable: true,
        suggestedAction: 'Upgrade to Pro for unlimited rescues',
      });
    }
    const granted = await grantProPass(user.id, parsed.data.adTransactionId, PRO_PASS_MINUTES);
    const fresh = await User.findByPk(user.id);
    return reply.status(granted ? 201 : 200).send({
      granted,
      proPassUntil: granted ? fresh?.proPassUntil : null,
    });
  });
}
