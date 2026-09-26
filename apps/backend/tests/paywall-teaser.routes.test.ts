/**
 * Paywall teaser route contract — POST /api/v1/paywall/teaser.
 *
 * Runs WITHOUT a database (client supplies lastMove, so no DB lookup fires).
 * NOTE: jest does not load .env, so GROQ_API_KEY is absent — every request
 * here must still succeed with deterministic fallback copy, never an error.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app';
import { signAccessToken } from '../src/lib/jwt';

jest.setTimeout(90_000);

const VALID_TOKEN = signAccessToken({
  sub: '00000000-0000-0000-0000-000000000000',
  email: 'paywall@mealrescue.test',
  subscriptionTier: 'free',
});

describe('paywall teaser route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns curiosity copy grounded in the client-provided last move', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/paywall/teaser',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { lastMove: { foods: ['rice'], added: ['fried egg'] } },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      success: boolean;
      data: { opener: string; hook: string; source: string; modelVersion: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.opener.length).toBeGreaterThan(4);
    expect(body.data.hook).toMatch(/^Wait till you see what/);
    expect(['ai', 'fallback']).toContain(body.data.source);
    expect(body.data.modelVersion).toBeTruthy();
  });

  it('serves cold-start copy when no last move is supplied (no fabrication)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/paywall/teaser',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      success: boolean;
      data: { opener: string; hook: string };
    };
    expect(body.data.opener).not.toMatch(/you liked|remember when/i);
    expect(body.data.hook).toMatch(/^Wait till you see what/);
  });

  it('rejects anonymous callers with the structured 401 shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/paywall/teaser',
      payload: { lastMove: { foods: ['rice'] } },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as {
      success: boolean;
      error?: { category?: string; code?: string; stack?: unknown };
    };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('UNAUTHORIZED');
    expect(body.error?.stack).toBeUndefined();
  });
});
