import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

/**
 * Registers a throwaway user against the running test app and returns
 * their bearer token. Keeps per-suite email uniqueness via UUID.
 */
export async function registerTestUser(
  app: FastifyInstance,
): Promise<{ token: string; userId: string; email: string }> {
  const email = `test-${randomUUID()}@mealrescue.test`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Sup3rSecret!', displayName: 'Pipeline Test' },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Test user registration failed (${res.statusCode}): ${res.body}`);
  }
  const body = res.json();
  return { token: body.accessToken as string, userId: body.user.id as string, email };
}
