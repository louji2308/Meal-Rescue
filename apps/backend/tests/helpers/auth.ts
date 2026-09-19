import { randomBytes, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

/**
 * Registers a throwaway user against the running test app and returns
 * their bearer token. Keeps per-suite email uniqueness via UUID.
 *
 * The register endpoint requires a valid email verification token.
 * In tests, we bypass the email-code flow by injecting a token directly
 * into Redis so the register handler accepts it.
 */
export async function registerTestUser(
  app: FastifyInstance,
): Promise<{ token: string; userId: string; email: string }> {
  const email = `test-${randomUUID()}@mealrescue.test`;

  // Create a verification token in Redis so the register endpoint accepts it.
  const verificationToken = `test-verify-${randomBytes(16).toString('hex')}`;
  if (app.redis) {
    await app.redis.set(`verify-token:${verificationToken}`, email.toLowerCase(), 'EX', 300);
  }

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'Sup3rSecret!',
      displayName: 'Pipeline Test',
      verificationToken,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Test user registration failed (${res.statusCode}): ${res.body}`);
  }
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string, email };
}
