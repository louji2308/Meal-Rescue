import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { AuthTokens, SubscriptionTier } from '@meal-rescue/shared-types';

import { env } from '../../config/env';
import { User } from '../../database/models/user.model';
import { AppError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { GoogleLoginInput, LoginInput, RegisterInput } from './auth.schemas';

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

  async googleLogin(input: GoogleLoginInput): Promise<AuthTokens> {
    if (!env.GOOGLE_WEB_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw AppError.internal('Google OAuth is not configured');
    }

    // Exchange authorization code for tokens with Google
    let googleEmail: string;
    let googleSub: string;
    try {
      const tokenParams: Record<string, string> = {
        code: input.code,
        client_id: env.GOOGLE_WEB_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      };
      if (input.codeVerifier) {
        tokenParams.code_verifier = input.codeVerifier;
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParams),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => '');
        console.error('[auth:google] token exchange failed', {
          status: tokenRes.status,
          body: errBody,
        });
        throw AppError.unauthorized('Invalid Google authorization code');
      }

      const tokenData = (await tokenRes.json()) as { id_token?: string };
      if (!tokenData.id_token) {
        throw AppError.unauthorized('No ID token returned from Google');
      }

      // Verify the ID token to get user info
      const infoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${tokenData.id_token}`,
      );
      if (!infoRes.ok) {
        throw AppError.unauthorized('Invalid Google token');
      }
      const payload = (await infoRes.json()) as { email: string; sub: string };
      googleEmail = payload.email;
      googleSub = payload.sub;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('Google authentication failed');
    }

    // Find or create user
    let user = await User.findOne({ where: { email: googleEmail.toLowerCase() } });
    if (!user) {
      user = await User.create({
        id: randomUUID(),
        email: googleEmail.toLowerCase(),
        passwordHash: null,
        subscriptionTier: 'free',
        googleId: googleSub,
        timezone: null,
        locale: 'en-US',
      });
    } else if (!user.googleId) {
      await user.update({ googleId: googleSub });
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
        onboardingCompleted: user.onboardingCompleted as boolean,
      },
    };
  }
}

export const authService = new AuthService();
