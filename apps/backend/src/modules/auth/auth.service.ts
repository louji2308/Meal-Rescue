import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { AuthTokens, SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { User } from '../../database/models/user.model';
import { AppError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { LoginInput, RegisterInput } from './auth.schemas';

/**
 * Local email+password auth issuing backend JWTs.
 *
 * Phase 1 scope: the Firebase project is not provisioned yet, so the API
 * owns credential storage (bcrypt) and token issuance (fast-jwt, verified
 * by @fastify/jwt). When Firebase lands, Firebase ID token verification
 * becomes an additional entry point into the same user-record + JWT flow.
 */
const BCRYPT_ROUNDS = 12;

export class AuthService {
  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await User.findOne({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      throw AppError.conflict(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await User.create({
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash,
      subscriptionTier: 'free',
      timezone: input.timezone ?? null,
      locale: input.locale,
    });

    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await User.findOne({ where: { email: input.email.toLowerCase() } });

    // Constant-shape failure: never reveal whether the email exists.
    if (!user || !user.passwordHash) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async getById(userId: string): Promise<User> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw AppError.notFound('User');
    }
    return user;
  }

  private issueTokens(user: User): AuthTokens {
    return {
      accessToken: signAccessToken({
        sub: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier as SubscriptionTier,
      }),
      expiresIn: env.JWT_EXPIRES_IN,
      user: {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier as SubscriptionTier,
      },
    };
  }
}

export const authService = new AuthService();
