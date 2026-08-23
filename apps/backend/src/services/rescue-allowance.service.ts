import { randomUUID } from 'node:crypto';

import { InferAttributes, Op, WhereOptions } from 'sequelize';

import type { SubscriptionTier, UUID } from '@meal-rescue/shared-types';

import { RATE_LIMITS } from '../config/constants';
import { RescueCreditGrant } from '../database/models/rescue-credit-grant.model';
import { Rescue } from '../database/models/rescue.model';
import { User } from '../database/models/user.model';

/**
 * Server-authoritative rescue allowance.
 *
 * The client NEVER decides entitlement: every /rescue/generate call passes
 * through consumeRescueAllowance(), which counts today's rescues for the
 * user's local day and spends an ad-earned credit when the free quota is
 * exhausted. Pro status comes from two sources - a paid subscription
 * (RevenueCat webhook -> subscription_tier) or a temporary ad pass
 * (proPassUntil) - whichever is stronger wins.
 */

export function effectiveTier(
  user: Pick<User, 'subscriptionTier' | 'proPassUntil'>,
): SubscriptionTier {
  if (user.subscriptionTier === 'pro') return 'pro';
  if (user.proPassUntil && user.proPassUntil.getTime() > Date.now()) return 'pro';
  return 'free';
}

/** Start of the user's LOCAL day as a UTC instant. */
export function startOfLocalDay(tzOffsetMinutes: number): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + tzOffsetMinutes * 60_000);
}

export async function countRescuesSince(userId: UUID, since: Date): Promise<number> {
  // createdAt is omitted from the model's InferAttributes, so it must be
  // referenced through a cast; underscored mapping sends it to created_at.
  const where = { userId, createdAt: { [Op.gte]: since } } as unknown as WhereOptions<
    InferAttributes<Rescue>
  >;
  return Rescue.count({ where });
}

export async function consumeRescueAllowance(
  user: User,
): Promise<{ allowed: boolean; reason?: 'limit' }> {
  if (effectiveTier(user) === 'pro') return { allowed: true };

  const used = await countRescuesSince(user.id, startOfLocalDay(user.tzOffsetMinutes ?? 0));
  if (used < RATE_LIMITS.free.rescuesPerDay) return { allowed: true };

  if ((user.rescueCredits ?? 0) > 0) {
    await user.decrement('rescueCredits');
    return { allowed: true };
  }

  return { allowed: false, reason: 'limit' };
}

/** Returns false on replay (same ad transaction claimed before). */
async function claimOnce(userId: string, namespacedTxId: string): Promise<boolean> {
  try {
    await RescueCreditGrant.create({
      id: randomUUID(),
      userId,
      adTransactionId: namespacedTxId,
    });
    return true;
  } catch {
    // Unique violation on ad_transaction_id = this reward was already used.
    return false;
  }
}

/**
 * Governance cap: at most TWO rewarded ads per local day, regardless of
 * surface. Replay of an existing transaction does not consume the cap.
 */
export const MAX_REWARDED_ADS_PER_DAY = 2;

export async function countRewardedAdsToday(
  userId: string,
  tzOffsetMinutes: number,
): Promise<number> {
  const where = {
    userId,
    createdAt: { [Op.gte]: startOfLocalDay(tzOffsetMinutes) },
  } as unknown as WhereOptions<InferAttributes<RescueCreditGrant>>;
  return RescueCreditGrant.count({ where });
}

export async function hasAdCapLeft(user: User): Promise<boolean> {
  const used = await countRewardedAdsToday(user.id, user.tzOffsetMinutes ?? 0);
  return used < MAX_REWARDED_ADS_PER_DAY;
}

export async function grantCredits(userId: string, txId: string, amount: number): Promise<boolean> {
  if (!(await claimOnce(userId, `credits:${txId}`))) return false;
  await User.increment({ rescueCredits: amount }, { where: { id: userId } });
  return true;
}

export async function grantProPass(
  userId: string,
  txId: string,
  minutes: number,
): Promise<boolean> {
  if (!(await claimOnce(userId, `propass:${txId}`))) return false;
  const until = new Date(Date.now() + minutes * 60_000);
  await User.update({ proPassUntil: until }, { where: { id: userId } });
  return true;
}
