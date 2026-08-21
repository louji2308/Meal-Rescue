import { FastifyReply, FastifyRequest } from 'fastify';

import { AuthUser } from '@meal-rescue/shared-types';

import { PUBLIC_ROUTES } from '../config/constants';
import { AppError } from '../lib/errors';

/**
 * JWT payload/user typing via @fastify/jwt's official augmentation point.
 * After request.jwtVerify(), `request.user` is the decoded payload.
 * NOTE: kept identical to what lib/jwt.ts actually signs - do not widen
 * this type beyond the real payload or TS will hide contract bugs.
 */
export interface JwtVerifiedUser {
  sub: string;
  email: string;
  subscriptionTier: AuthUser['subscriptionTier'];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtVerifiedUser;
    user: JwtVerifiedUser;
  }
}

/**
 * JWT authentication hook.
 *
 * Public routes pass through untouched; everything else must carry a valid
 * Bearer token. On success the verified user is attached to `request.user`.
 */
function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((route) => url === route || url.startsWith(`${route}?`));
}

export async function authHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (isPublicRoute(request.url)) {
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    throw AppError.unauthorized();
  }
}
