import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';

import { User } from '../../src/database/models/user.model';
import { signAccessToken } from '../../src/lib/jwt';

/**
 * Registers a throwaway user directly in the database and returns a JWT.
 *
 * This bypasses the HTTP /auth/register endpoint (which requires email
 * verification via Redis) because in the test environment Redis is disabled
 * (app.redis is null) so verification tokens can't be stored or validated.
 */
export async function registerTestUser(
  _app: FastifyInstance,
): Promise<{ token: string; userId: string; email: string }> {
  const email = `test-${randomUUID()}@mealrescue.test`;
  const passwordHash = await bcrypt.hash('Sup3rSecret!', 12);

  const user = await User.create({
    id: randomUUID(),
    email: email.toLowerCase(),
    passwordHash,
    subscriptionTier: 'free',
    timezone: null,
    locale: 'en-US',
  });

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    subscriptionTier: 'free',
  });

  return { token, userId: user.id, email };
}
