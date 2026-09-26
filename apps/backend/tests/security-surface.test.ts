/**
 * API security surface regression suite (Subagent 5 - adversarial audit).
 *
 * Runs WITHOUT a database: every assertion here exercises the Fastify
 * auth hook, global error handler, body-size limit and rate limiter -
 * all of which fire before any service/DB work. This is deliberately the
 * cheapest possible place to prove the security contract holds across the
 * whole route surface.
 *
 * Guards under test:
 *  1. EVERY protected route rejects anonymous / bad-token callers with the
 *     structured 401 (UNAUTHORIZED) shape - no route is left open.
 *  2. PUBLIC_ROUTES stay reachable without a token (health + webhook with
 *     its own shared-secret gate, never the user JWT).
 *  3. zod validation rejects malformed payloads with INPUT_VALIDATION errors
 *     before any service logic runs.
 *  4. The global body-size limit returns a structured, non-leaky 413.
 *  5. The global rate limiter actually trips at the configured ceiling.
 *  6. Error responses never contain stack traces or secrets.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

import { BODY_LIMIT_BYTES, buildApp } from '../src/app';
import { env } from '../src/config/env';
import { signAccessToken } from '../src/lib/jwt';

// Cold-start buildApp() runs a slow-to-give-up Redis connect attempt when no
// cache is running locally (jest does not load .env), so hooks need room.
jest.setTimeout(90_000);

const UUID = '00000000-0000-0000-0000-000000000000';
const VALID_TOKEN = signAccessToken({
  sub: UUID,
  email: 't@mealrescue.test',
  subscriptionTier: 'free',
});

type Endpoint = { method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'; url: string };

/** One real protected route per family registered in src/app.ts. */
const PROTECTED_SURFACE: Endpoint[] = [
  // user
  { method: 'GET', url: '/api/v1/user/me' },
  { method: 'GET', url: '/api/v1/user/preferences' },
  { method: 'GET', url: '/api/v1/user/insights' },
  { method: 'GET', url: '/api/v1/user/taste' },
  { method: 'POST', url: '/api/v1/user/taste/compass' },
  // households
  { method: 'GET', url: '/api/v1/households/current' },
  { method: 'POST', url: '/api/v1/households' },
  { method: 'POST', url: '/api/v1/households/members' },
  { method: 'PATCH', url: `/api/v1/households/members/${UUID}` },
  { method: 'DELETE', url: `/api/v1/households/members/${UUID}` },
  // common table
  { method: 'POST', url: '/api/v1/common-table/converge' },
  { method: 'GET', url: `/api/v1/common-table/${UUID}` },
  { method: 'POST', url: `/api/v1/common-table/${UUID}/start` },
  { method: 'POST', url: `/api/v1/common-table/${UUID}/split` },
  { method: 'POST', url: `/api/v1/common-table/${UUID}/complete` },
  { method: 'POST', url: `/api/v1/common-table/${UUID}/feedback` },
  // kitchen
  { method: 'GET', url: '/api/v1/kitchen' },
  { method: 'POST', url: '/api/v1/kitchen/identify' },
  { method: 'POST', url: '/api/v1/kitchen/what-can-i-make' },
  // pantry
  { method: 'GET', url: '/api/v1/pantry' },
  { method: 'POST', url: '/api/v1/pantry' },
  { method: 'DELETE', url: `/api/v1/pantry/${UUID}` },
  { method: 'POST', url: `/api/v1/pantry/${UUID}/use` },
  // meal
  { method: 'POST', url: '/api/v1/meal/analyze' },
  // rescue + decision + feedback + satisfaction + aftercare
  { method: 'POST', url: '/api/v1/rescue/generate' },
  { method: 'POST', url: `/api/v1/rescue/${UUID}/decide` },
  { method: 'POST', url: `/api/v1/rescue/${UUID}/feedback` },
  { method: 'POST', url: `/api/v1/rescue/${UUID}/satisfaction` },
  { method: 'GET', url: `/api/v1/rescue/${UUID}/aftercare-eligibility` },
  // meal memory
  { method: 'POST', url: '/api/v1/meal-memory/intent' },
  { method: 'POST', url: '/api/v1/meal-memory/confirm' },
  { method: 'POST', url: '/api/v1/meal-memory/plan-week' },
  { method: 'GET', url: '/api/v1/meal-memory/week' },
  { method: 'PATCH', url: `/api/v1/meal-memory/meals/${UUID}` },
  { method: 'POST', url: `/api/v1/meal-memory/meals/${UUID}/move` },
  { method: 'POST', url: `/api/v1/meal-memory/meals/${UUID}/remove` },
  { method: 'POST', url: '/api/v1/meal-memory/record-actual' },
  { method: 'POST', url: '/api/v1/meal-memory/remember' },
  { method: 'POST', url: '/api/v1/meal-memory/rules' },
  { method: 'GET', url: '/api/v1/meal-memory/rules' },
  { method: 'POST', url: '/api/v1/meal-memory/feedback' },
  // ai-rescue (registered with no prefix - still must be hook-protected)
  { method: 'POST', url: '/api/v1/ai-rescue/generate' },
  { method: 'POST', url: '/api/v1/ai-rescue/negotiate' },
  // paywall teaser
  { method: 'POST', url: '/api/v1/paywall/teaser' },
  // subscription
  { method: 'POST', url: '/api/v1/subscription/sync' },
  // ads + notifications
  { method: 'GET', url: '/api/v1/ads/eligibility' },
  { method: 'POST', url: '/api/v1/notifications/snooze' },
];

function expectStructuredUnauthorized(body: unknown): void {
  const parsed = body as {
    success: boolean;
    error?: {
      category?: string;
      code?: string;
      message?: string;
      recoverable?: boolean;
      stack?: unknown;
    };
    requestId?: string;
    timestamp?: string;
  };
  expect(parsed.success).toBe(false);
  expect(parsed.error?.category).toBe('UNAUTHORIZED');
  expect(parsed.error?.code).toBe('UNAUTHORIZED');
  expect(parsed.error?.message).toBe('Invalid or missing authentication token');
  expect(parsed.error?.recoverable).toBe(true);
  expect(parsed.error?.stack).toBeUndefined();
  expect(parsed.requestId).toBeTruthy();
  expect(parsed.timestamp).toBeTruthy();
}

describe('security surface - 401 enforcement on every protected route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(PROTECTED_SURFACE)(
    'rejects anonymous $method $url with structured 401',
    async ({ method, url }) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expectStructuredUnauthorized(res.json());
    },
  );

  it.each(PROTECTED_SURFACE)(
    'rejects garbage bearer token on $method $url',
    async ({ method, url }) => {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: 'Bearer not-a-real-token' },
      });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body) as { error?: { message?: string } };
      expect(body.error?.message).toBe('Invalid or missing authentication token');
    },
  );

  it('does not leak stack traces or secrets through the 401 body', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/user/me' });
    const raw = res.body;
    expect(raw).not.toMatch(/at\s+\w+\.\w+/);
    expect(raw).not.toMatch(/stack|trace|secret|jwt/i);
  });
});

describe('security surface - public routes and the webhook gates', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves /health without authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe('ok');
  });

  it('keeps the revenuecat webhook public (no user JWT) but secret-gated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/revenuecat',
      payload: {},
    });
    // Public route: a missing/bad shared secret must NOT produce a user-JWT 401,
    // and must never reveal the secret itself.
    const raw = res.body;
    expect(raw).not.toMatch(/rc-webhook/);
    if (!env.REVENUECAT_WEBHOOK_SECRET) {
      expect(res.statusCode).not.toBe(401);
      const body = res.json() as { success: boolean; error?: { code?: string; message?: string } };
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('INTERNAL_ERROR');
      expect(body.error?.message).toContain('Webhook authentication is not configured');
      expect(raw).not.toMatch(/REVENUECAT_WEBHOOK_SECRET/);
    } else {
      // With a secret configured, the shared-secret gate rejects a bare call.
      expect(res.statusCode).toBe(401);
    }
  });

  it('unauthenticated callers cannot probe the route surface (401, not 404)', async () => {
    const res = await app.inject({ method: 'GET', url: '/definitely-not-a-route-xyz' });
    expect(res.statusCode).toBe(401);
  });
});

describe('security surface - zod validation contract on malformed bodies', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = { authorization: `Bearer ${VALID_TOKEN}` };

  const cases: {
    name: string;
    method: 'POST' | 'PATCH';
    url: string;
    payload: object;
    code: string;
  }[] = [
    {
      name: 'household member missing displayName',
      method: 'POST',
      url: '/api/v1/households/members',
      payload: {},
      code: 'INVALID_MEMBER_INPUT',
    },
    {
      name: 'household member displayName too long',
      method: 'POST',
      url: '/api/v1/households/members',
      payload: { displayName: 'x'.repeat(121) },
      code: 'INVALID_MEMBER_INPUT',
    },
    {
      name: 'converge with empty member list',
      method: 'POST',
      url: '/api/v1/common-table/converge',
      payload: { memberIds: [], ingredients: [] },
      code: 'INVALID_COMMON_TABLE_INPUT',
    },
    {
      name: 'converge with malformed memberIds',
      method: 'POST',
      url: '/api/v1/common-table/converge',
      payload: { memberIds: ['not-a-uuid'], ingredients: [] },
      code: 'INVALID_COMMON_TABLE_INPUT',
    },
    {
      name: 'pantry item missing name',
      method: 'POST',
      url: '/api/v1/pantry',
      payload: {},
      code: 'INVALID_PANTRY_INPUT',
    },
    {
      name: 'pantry quantity zero',
      method: 'POST',
      url: '/api/v1/pantry',
      payload: { ingredientName: 'milk', quantity: 0 },
      code: 'INVALID_PANTRY_INPUT',
    },
    {
      name: 'pantry quantity negative',
      method: 'POST',
      url: '/api/v1/pantry',
      payload: { ingredientName: 'milk', quantity: -2 },
      code: 'INVALID_PANTRY_INPUT',
    },
    {
      name: 'kitchen identify short image',
      method: 'POST',
      url: '/api/v1/kitchen/identify',
      payload: { imageBase64: 'too-short' },
      code: 'INVALID_KITCHEN_INPUT',
    },
    {
      name: 'kitchen what-can-i-make time zero',
      method: 'POST',
      url: '/api/v1/kitchen/what-can-i-make',
      payload: { timeAvailable: 0 },
      code: 'INVALID_KITCHEN_INPUT',
    },
    {
      name: 'meal analyze empty',
      method: 'POST',
      url: '/api/v1/meal/analyze',
      payload: {},
      code: 'INVALID_ANALYSIS_INPUT',
    },
    {
      name: 'meal-memory intent empty text',
      method: 'POST',
      url: '/api/v1/meal-memory/intent',
      payload: { text: '' },
      code: 'INVALID_INTENT_INPUT',
    },
    {
      name: 'meal-memory plan-week unknown key (strict)',
      method: 'POST',
      url: '/api/v1/meal-memory/plan-week',
      payload: { mealSlots: ['dinner'], injection: true },
      code: 'INVALID_MEAL_MEMORY_INPUT',
    },
    {
      name: 'meal-memory move missing dateKey',
      method: 'POST',
      url: `/api/v1/meal-memory/meals/${UUID}/move`,
      payload: {},
      code: 'INVALID_MEAL_MEMORY_INPUT',
    },
    {
      name: 'onboarding cuisines empty',
      method: 'POST',
      url: '/api/v1/user/taste/onboarding/cuisines',
      payload: {},
      code: 'INVALID_CUISINE_INPUT',
    },
    {
      name: 'onboarding answers empty',
      method: 'POST',
      url: '/api/v1/user/taste/onboarding/answers',
      payload: {},
      code: 'INVALID_ONBOARDING_INPUT',
    },
    {
      name: 'rescue generate bad mealId',
      method: 'POST',
      url: '/api/v1/rescue/generate',
      payload: { mealId: 'nope' },
      code: 'INVALID_GENERATE_INPUT',
    },
    {
      name: 'decision commit empty body',
      method: 'POST',
      url: `/api/v1/rescue/${UUID}/decide`,
      payload: {},
      code: 'INVALID_DECIDE_INPUT',
    },
    {
      name: 'common-table feedback empty body',
      method: 'POST',
      url: `/api/v1/common-table/${UUID}/feedback`,
      payload: {},
      code: 'INVALID_FEEDBACK_INPUT',
    },
  ];

  it.each(cases)('$name → 400 $code', async ({ method, url, payload, code }) => {
    const res = await app.inject({ method, url, headers: auth, payload });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { success: boolean; error?: { code?: string; category?: string } };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe(code);
    expect(body.error?.category).toBe('INPUT_VALIDATION');
  });

  it('never includes the request body or secrets in a validation error response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/households/members',
      headers: auth,
      payload: { displayName: 'x'.repeat(121) },
    });
    const raw = res.body;
    expect(raw).not.toContain('x'.repeat(8));
    expect(raw).not.toMatch(/secret|password|token/i);
  });
});

describe('security surface - body size limit and error contract for 413', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects an oversized JSON body with a structured, non-leaky 413', async () => {
    // Sized off the real ceiling: 1 MB used to work until bodyLimit grew to
    // 10 MB, which silently downgraded this to a 400 from zod instead.
    const big = 'a'.repeat(BODY_LIMIT_BYTES + 1_000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pantry',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { ingredientName: 'milk', notes: big },
    });
    expect(res.statusCode).toBe(413);
    const body = res.json() as {
      success: boolean;
      error?: { code?: string; message?: string; stack?: unknown };
    };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBeTruthy();
    expect(body.error?.stack).toBeUndefined();
    expect(res.body).not.toMatch(/at\s+\w+\.\w+/);
    expect(res.body).not.toContain(big.slice(0, 64));
  });
});

describe('security surface - global rate limiter', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it(`trips at the configured ceiling (${env.RATE_LIMIT_MAX_REQUESTS}/min)`, async () => {
    const max = env.RATE_LIMIT_MAX_REQUESTS;
    const results = [] as { statusCode: number }[];
    for (let i = 0; i < max + 5; i++) {
      results.push(await app.inject({ method: 'GET', url: '/health' }));
    }
    const firstOk = results.slice(0, max).map((r) => r.statusCode);
    const overage = results.slice(max).map((r) => r.statusCode);
    expect(firstOk.every((code) => code === 200)).toBe(true);
    expect(overage).toEqual(Array(5).fill(429));
  });
});

describe('security surface - ai-rescue error path (no key, degraded 502)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('declines gracefully when the provider key is absent, without leaking secrets/stack', async () => {
    // The service reads OPENAI_API_KEY (not OPENROUTER_API_KEY). Skip only
    // when the real provider key is present; jest does not load .env so this
    // test normally runs keyless and must observe the degraded 502.
    if (env.OPENAI_API_KEY) return;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-rescue/generate',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { foods: ['instant noodles'], timeOfDay: 'afternoon' },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json() as {
      success: boolean;
      error?: { message?: string; code?: string; stack?: unknown };
    };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('AI_RESUCE_ERROR');
    expect(body.error?.message).toBe('The AI rescue service is temporarily unavailable');
    expect(body.error?.stack).toBeUndefined();
    expect(res.body).not.toMatch(/at\s+\w+\.\w+/);
    expect(res.body).not.toContain('Bearer');
    expect(res.body).not.toContain('OPENROUTER_API_KEY');
  });
});

describe('security surface - subscription sync contract (RevenueCat-dependent)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the declared 503 when RevenueCat is not configured', async () => {
    if (env.REVENUECAT_API_KEY) return;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/sync',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as {
      success: boolean;
      error?: { code?: string; category?: string; recoverable?: boolean };
    };
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('REVENUECAT_NOT_CONFIGURED');
    expect(body.error?.category).toBe('EXTERNAL_SERVICE_FAILURE');
    expect(body.error?.recoverable).toBe(false);
  });

  it('never echoes the RevenueCat secret and degrades structurally (even when reachable)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/sync',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: {},
    });
    const raw = res.body;
    expect(raw).not.toMatch(/sk_/);
    expect(raw).not.toContain('Bearer');

    if (res.statusCode === 200) {
      expect((res.json() as { tier: string }).tier).toBeTruthy();
      return;
    }
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    const body = res.json() as { success: boolean; error?: { category?: string; stack?: unknown } };
    expect(body.success).toBe(false);
    expect(body.error?.category).toBe('EXTERNAL_SERVICE_FAILURE');
    expect(body.error?.stack).toBeUndefined();
    expect(raw).not.toMatch(/at\s+\w+\.\w+/);
  });
});
