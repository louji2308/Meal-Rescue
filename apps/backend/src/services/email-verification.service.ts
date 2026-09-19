import { createHash, randomInt } from 'node:crypto';

import { env } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * Email verification service.
 *
 * Generates 6-digit codes, hashes them with SHA-256, stores in Redis with
 * a 10-minute TTL, and sends via Resend API. Verification is timing-safe.
 */

const CODE_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const RATE_LIMIT_MAX_CODES = 3;

interface VerificationRecord {
  codeHash: string;
  createdAt: number;
  attempts: number;
  consumed: boolean;
}

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function verificationKey(email: string): string {
  return `email-verify:${email.toLowerCase().trim()}`;
}

function rateLimitKey(email: string): string {
  return `email-verify-rate:${email.toLowerCase().trim()}`;
}

export class EmailVerificationService {
  async sendCode(
    redis: {
      get: (k: string) => Promise<string | null>;
      set: (k: string, v: string, ...args: any[]) => Promise<any>;
    } | null,
    email: string,
  ): Promise<{ sent: boolean }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit check
    if (redis) {
      const rateKey = rateLimitKey(normalizedEmail);
      const rateCount = await redis.get(rateKey);
      if (rateCount && parseInt(rateCount, 10) >= RATE_LIMIT_MAX_CODES) {
        throw AppError.rateLimited(RATE_LIMIT_WINDOW_SECONDS);
      }
    }

    const code = generateCode();
    const codeHash = hashCode(code);
    const record: VerificationRecord = {
      codeHash,
      createdAt: Date.now(),
      attempts: 0,
      consumed: false,
    };

    // Store hashed code in Redis
    if (redis) {
      const key = verificationKey(normalizedEmail);
      await redis.set(key, JSON.stringify(record), 'EX', CODE_TTL_SECONDS);

      const rlKey = rateLimitKey(normalizedEmail);
      const cur = await redis.get(rlKey);
      const next = cur ? parseInt(cur, 10) + 1 : 1;
      await redis.set(rlKey, next.toString(), 'EX', RATE_LIMIT_WINDOW_SECONDS);
    }

    // Send email via OneSignal
    await this.sendEmail(normalizedEmail, code);

    return { sent: true };
  }

  async verifyCode(
    redis: {
      get: (k: string) => Promise<string | null>;
      set: (k: string, v: string, ...args: any[]) => Promise<any>;
      del: (...keys: string[]) => Promise<any>;
    } | null,
    email: string,
    code: string,
  ): Promise<{ verified: boolean; token: string }> {
    if (!redis) {
      throw AppError.internal('Email verification requires Redis');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const key = verificationKey(normalizedEmail);
    const raw = await redis.get(key);

    if (!raw) {
      throw AppError.badRequest('CODE_EXPIRED', 'Code expired or never sent. Request a new one.');
    }

    const record: VerificationRecord = JSON.parse(raw);

    if (record.consumed) {
      throw AppError.badRequest('CODE_USED', 'Code already used. Request a new one.');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await redis.del(key);
      throw AppError.badRequest('CODE_LOCKED', 'Too many failed attempts. Request a new code.');
    }

    const inputHash = hashCode(code);
    if (!timingSafeCompare(inputHash, record.codeHash)) {
      record.attempts += 1;
      await redis.set(key, JSON.stringify(record), 'EX', CODE_TTL_SECONDS);
      const remaining = MAX_ATTEMPTS - record.attempts;
      if (remaining <= 0) {
        throw AppError.badRequest('CODE_LOCKED', 'Too many failed attempts. Request a new code.');
      }
      throw AppError.badRequest('CODE_INVALID', `Invalid code. ${remaining} attempts left.`);
    }

    // Mark consumed
    record.consumed = true;
    await redis.set(key, JSON.stringify(record), 'EX', CODE_TTL_SECONDS);

    // Generate short-lived verification token (5 min TTL)
    const token = this.generateToken(normalizedEmail);
    await redis.set(`verify-token:${token}`, normalizedEmail, 'EX', 5 * 60);

    return { verified: true, token };
  }

  async validateToken(
    redis: {
      get: (k: string) => Promise<string | null>;
      del: (...keys: string[]) => Promise<any>;
    } | null,
    token: string,
  ): Promise<string | null> {
    if (!redis) return null;
    const key = `verify-token:${token}`;
    const email = await redis.get(key);
    if (!email) return null;
    await redis.del(key);
    return email;
  }

  private generateToken(email: string): string {
    const ts = Date.now().toString(36);
    const rand = createHash('sha256')
      .update(`${email}:${ts}:${Math.random()}`)
      .digest('hex')
      .slice(0, 24);
    return `${ts}.${rand}`;
  }

  private async sendEmail(to: string, code: string): Promise<void> {
    if (!env.ONESIGNAL_REST_KEY || !env.ONESIGNAL_APP_ID) {
      console.warn(`[email-verify] OneSignal not configured - code for ${to}: ${code}`);
      return;
    }

    const emailBody = `
      <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #161616; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #666; font-size: 15px; line-height: 1.5;">
          Use this code to complete your sign-in. It expires in 10 minutes.
        </p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #EA0F55;">${code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `;

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${env.ONESIGNAL_REST_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        include_email_tokens: [to],
        email_subject: 'Your Meal Rescue verification code',
        email_body: emailBody,
        include_unsubscribed: true,
      }),
    });

    const data = (await res.json()) as { id?: string; errors?: unknown[] };

    if (!res.ok) {
      console.error(`[email-verify] OneSignal email failed (${res.status}):`, data);
      throw AppError.internal('Failed to send verification email');
    }

    console.log(`[email-verify] OneSignal email sent to ${to}, id: ${data.id}`);
  }
}

export const emailVerificationService = new EmailVerificationService();
