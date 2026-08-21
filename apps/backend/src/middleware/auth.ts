import { FastifyReply, FastifyRequest } from 'fastify';

import { AuthUser } from '@meal-rescue/shared-types';

import { PUBLIC_ROUTES } from '../config/constants';
import { AppError } from '../lib/errors';

/**
 * JWT payload/user typing via @fastify/jwt's official augmentation point.
 * After request.jwtVerify(), `request.user` is a fully-typed AuthUser.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; subscriptionTier: AuthUser['subscriptionTier'] };
    user: AuthUser;
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
