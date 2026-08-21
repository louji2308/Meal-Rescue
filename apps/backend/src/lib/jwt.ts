import { createSigner } from 'fast-jwt';

import { SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../config/env';

/**
 * Standalone JWT signer.
 *
 * Signing lives outside the Fastify instance so services never depend on
 * the HTTP layer (and tests can issue tokens without booting the server).
 * Verification happens through @fastify/jwt registered with the same
 * secret - both sides use the HS256 default of fast-jwt.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  subscriptionTier: SubscriptionTier;
}

const signer = createSigner({
  key: env.JWT_SECRET,
  expiresIn: env.JWT_EXPIRES_IN,
});

export function signAccessToken(payload: JwtPayload): string {
  return signer(payload);
}
