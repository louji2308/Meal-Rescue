# Security

What this application protects, how, and — importantly — what it does **not** claim.

This document is about **technical controls and the evidence for them**. What personal
data is collected, how long it is kept, and what rights you have are covered by the
**Privacy Policy** (maintained outside this repository). Product-level safety rules
(allergies, "not medical advice", model provenance) live in the README under
*Safety, privacy, and responsible AI*. Neither is restated here.

---

## 1. Scope and honest framing

| | |
|---|---|
| **Application** | Meal Rescue — Expo/React Native client, Fastify API, PostgreSQL, Redis |
| **Trust boundary** | The client is untrusted. Every allowance, entitlement, and authorization decision is made server-side. |
| **What is claimed** | The controls in §3 exist in code, and §4 lists the tests that assert them. |
| **What is not claimed** | No penetration test, no security audit, no compliance certification (SOC 2, ISO 27001, GDPR, HIPAA). No bug bounty. Nothing in this repository should be read as such a claim. |

The most useful thing in this document is §6, which lists the gaps.

---

## 2. Threat model

Assumed adversaries, in rough order of likelihood:

1. **An anonymous internet caller** hitting the API directly, trying to reach data or
   exhaust resources without credentials.
2. **An authenticated user attacking another user's data** — guessing or altering ids
   belonging to someone else (broken object-level authorization).
3. **A tampered or replayed RevenueCat webhook**, attempting to grant Pro without paying.
4. **A compromised or curious client** — a modified app, a logged request, an `EXPO_PUBLIC_*`
   value read off the device.
5. **A model producing unsafe or invented output** — constrained so it cannot become an
   authorization or data-integrity path.

Out of scope for this document: physical access, compromise of the host or of RevenueCat
itself, and supply-chain attacks on npm beyond normal lockfile pinning.

---

## 3. Controls implemented

### 3.1 Transport, headers, and origin

- **`@fastify/helmet`** is registered with `frameguard: { action: 'deny' }`,
  `referrerPolicy: { policy: 'no-referrer' }`, `noSniff`, and `xssFilter`
  ([`app.ts:72-86`](./apps/backend/src/app.ts)). HSTS applies in production.
- **Content-Security-Policy is deliberately disabled** (`contentSecurityPolicy: false`,
  [`app.ts:74`](./apps/backend/src/app.ts)) — recorded as a gap in §6 rather than
  presented as a control.
- **CORS is an explicit allowlist**, not a wildcard by default: origins come from
  `CORS_ORIGIN` split on commas ([`app.ts:68-70`](./apps/backend/src/app.ts)). `*`
  is possible only if the operator sets it explicitly.

### 3.2 Authentication and session

- **Passwords are hashed with bcrypt at 12 rounds** (`BCRYPT_ROUNDS = 12`,
  [`auth.service.ts:21`](./apps/backend/src/modules/auth/auth.service.ts); hash at `:34`,
  compare at `:88`).
- **JWTs are issued and verified through `@fastify/jwt`** with `JWT_SECRET` and
  `JWT_EXPIRES_IN` from environment configuration ([`app.ts:96-98`](./apps/backend/src/app.ts)).
- **Everything not on the public list requires a valid Bearer token.** `authHook` passes
  through only routes named in `PUBLIC_ROUTES`
  ([`constants.ts:7`](./apps/backend/src/config/constants.ts)) and calls `jwtVerify()` on
  every other request ([`middleware/auth.ts`](./apps/backend/src/middleware/auth.ts)). The
  list is small and explicit: `/health`, the Swagger docs, the five auth endpoints, and the
  RevenueCat webhook.
- **Those five auth endpoints are public by necessity and are rate-limited instead of
  authenticated** — a caller cannot present a token in order to obtain one. They carry a
  stricter per-route limit of **5 requests per 15 minutes** (`AUTH_RATE_LIMIT`,
  [`auth.routes.ts:28`](./apps/backend/src/modules/auth/auth.routes.ts)), which is what
  bounds brute force and email-bombing. That rate limit, not JWT, is the control here.

### 3.3 Authorization and tenant isolation

Every row-level operation is scoped by the authenticated user id taken from the token —
**never from the request body or a path parameter supplied by the client**.

Isolation is not asserted here as a property of the design; it is asserted by nine
specific tests listed in §4, covering households, shared meals, pantry items,
meal-memory plan events, and rescues.

### 3.4 Input validation and resource limits

- **Zod schemas with `.strict()`** validate bodies in handlers; decision-affecting routes
  use strict schemas so unexpected fields are rejected rather than ignored.
- **A 10 MB body limit** is enforced consistently for JSON and multipart
  (`BODY_LIMIT_BYTES = 10 * 1024 * 1024`, [`app.ts:43,61`](./apps/backend/src/app.ts)),
  matching the multipart file-size limit.
- **Global rate limiting via `@fastify/rate-limit`, Redis-backed**
  ([`app.ts:101-106`](./apps/backend/src/app.ts)), plus per-route business ceilings
  (AI rescue, paywall teaser, auth).
- **A centralized error handler** (`registerErrorHandler`, [`app.ts:132`](./apps/backend/src/app.ts))
  converts failures into a fixed response contract so handlers cannot accidentally
  serialise internals.

### 3.5 Secrets and configuration

- **No secret is committed.** `apps/mobile/.env` is gitignored
  ([`.gitignore:34`](./apps/mobile/.gitignore)); the checked-in `.env.example` ships
  empty RevenueCat keys. Server secrets (`JWT_SECRET`, `REVENUECAT_WEBHOOK_SECRET`,
  `REVENUECAT_API_KEY`, database URLs) are environment-only.
- **`EXPO_PUBLIC_*` values are client-visible by construction** and are therefore never
  used for server-side authority. The RevenueCat public key is a publishable identifier,
  not a credential.
- **A flag gates whether a client-reported entitlement may stand in** when RevenueCat's
  REST API is unavailable (`REVENUECAT_ALLOW_CLIENT_ENTITLEMENT`,
  [`subscription.routes.ts:22-23`](./apps/backend/src/routes/subscription.routes.ts)).
  Production verification goes to RevenueCat's API rather than trusting the device.
- **Sentry is initialised conditionally** from environment configuration
  ([`server.ts:25-30`](./apps/backend/src/server.ts)) and is off when no DSN is set.

### 3.6 Third-party integrations

- **RevenueCat webhook** is the only route on the public surface without a user JWT. It is
  gated by a shared bearer secret compared with a timing-safe equality check
  (`timingSafeEqualStr`, [`webhook.routes.ts`](./apps/backend/src/routes/webhook.routes.ts)).
  Processing behaviour, including two documented deviations from RevenueCat's guidance, is
  detailed in [`docs/PAYWALL.md`](./docs/PAYWALL.md) §6.
- **AI providers** receive only what a request requires — images are transmitted in memory
  as data URIs for a single analysis. Model output is parsed and validated before use; it
  is never an authorization or persistence path.

---

## 4. Verification — what the tests actually assert

These are claims about test files that exist and what they check. Nothing in this section
is inferred from code review alone.

### Authentication surface — [`tests/security-surface.test.ts`](./apps/backend/tests/security-surface.test.ts) (18,430 bytes)

- **401 on every protected route**, driven by a `PROTECTED_SURFACE` table with `it.each`,
  asserted twice per route: anonymous, and with a garbage bearer token.
- **401 rather than 404**, so an unauthenticated caller cannot enumerate the route surface.
- **The 401 body leaks neither stack traces nor secrets**, and carries the fixed message
  `Invalid or missing authentication token`.
- **`/health` remains public** — the deliberately unauthenticated route is explicit.
- **The RevenueCat webhook stays public but secret-gated**, so RevenueCat can call it
  without a user JWT while anonymous callers still cannot.
- **Zod validation errors never echo the request body or any secret.**
- **An oversized body returns a structured, non-leaky 413.**
- **The global rate limiter trips at the configured ceiling** (`RATE_LIMIT_MAX_REQUESTS`/min).
- **Degraded dependency paths do not leak**: the AI provider path declines gracefully with a
  502 when its key is absent, and subscription sync returns the declared 503 when RevenueCat
  is unconfigured — **and never echoes the RevenueCat secret even when reachable**.

### Cross-tenant isolation — [`tests/security-cross-user.integration.test.ts`](./apps/backend/tests/security-cross-user.integration.test.ts) (10,157 bytes)

Nine assertions, all with user B attempting to reach or mutate user A's data:

| # | Assertion |
|---|---|
| 1 | B sees their own empty household, not A's |
| 2 | B cannot converge a shared table using A's household member |
| 3 | B cannot read, start, split, complete, or define A's shared meal |
| 4 | A can still drive their own session — isolation is per-user, not a global lockout |
| 5 | B cannot delete or use A's pantry item |
| 6 | B cannot see A's household members |
| 7 | B cannot mutate A's meal-memory plan events |
| 8 | B cannot make decisions against A's (or random) rescues |
| 9 | B cannot modify A's household members |

### Supporting suites

- [`tests/auth-middleware.test.ts`](./apps/backend/tests/auth-middleware.test.ts) — token
  rejection and middleware ordering.
- [`tests/integration/auth.integration.test.ts`](./apps/backend/tests/integration/auth.integration.test.ts)
  — registration, login, and token lifecycle against a real database.
- [`tests/webhook.test.ts`](./apps/backend/tests/webhook.test.ts) and
  [`tests/integration/webhook.integration.test.ts`](./apps/backend/tests/integration/webhook.integration.test.ts)
  — webhook authentication and event handling.

**Coverage total: 72 backend test files, 22 of them database-backed.** CI runs lint,
typecheck, the backend suite against PostgreSQL 15, the build, and Expo Doctor.

---

## 5. Data handling

This section deliberately does not restate retention policy. The short version that
matters for security posture:

- **Meal images are never persisted.** There is no image or `BLOB` column in any of the
  36 models. Images go to the AI provider in memory; only a SHA-256 hash is used as a
  Redis cache key with a 24-hour TTL
  ([`vision.service.ts:34,47`](./apps/backend/src/services/ai/vision.service.ts)).
- **Account deletion performs a cascade** — best-effort RevenueCat subscriber deletion,
  best-effort OneSignal user deletion, destruction of every model row carrying the user
  id, then the user record
  ([`user.routes.ts:111`](./apps/backend/src/routes/user.routes.ts)).

Full retention, legal bases, and rights are in the Privacy Policy, not here.

---

## 6. Known gaps and non-claims

Listed so a reviewer does not have to discover them. Each is real and verified.

### The free-tier allowance gate is unreachable from the product

The backend enforces the 3-rescue limit at `rescue.routes.ts:83` and returns
`429 RESCUE_LIMIT`; that endpoint is covered by tests. **No navigation in the app reaches
it.** It sits behind the `Review → Intent → Reality → Craving → RescueLoading` chain and
nothing calls `navigate('Review')` — `CaptureScreen.tsx:51` still says "success navigates
to Review" while the code routes to `MealReview`.

**Security relevance:** the enforcement point exists and is tested, but the client-side
path that would trigger it is orphaned, so the conversational rescue route is limited only
by the global rate limiter rather than by the per-account allowance. This is a
**control-reachability gap, not a bypass of an enforced control** — but it means the
intended economic and abuse limit is not currently exercised in the running product.

### Content-Security-Policy is disabled

`contentSecurityPolicy: false` ([`app.ts:74`](./apps/backend/src/app.ts)). Helmet's other
headers are on. For an API that returns JSON rather than serving HTML this is low impact,
but it is a disabled control, not an enabled one.

### Webhook processing has no event-id idempotency

Retries converge because the handler writes an absolute value
(`subscriptionTier = 'pro' | 'free'`) rather than an incremental one, so a duplicate is
harmless. **Out-of-order delivery is not handled**: a stale event written after a fresher
one wins. Two further deviations are documented in
[`docs/PAYWALL.md`](./docs/PAYWALL.md) §6:

- `CANCELLATION` revokes immediately, whereas RevenueCat's guidance is to revoke only at
  `EXPIRATION` — the effect is stricter than required, and fails in the safe direction.
- `GRANTING_EVENTS` contains `'UNCANCEL'`, which is not a RevenueCat event type (the real
  one is `UNCANCELLATION`), so webhook-driven uncancellations do not restore Pro. The state
  self-heals on the next `POST /api/v1/subscription/sync`.

### Other non-claims

- **No data-export endpoint exists**, although the Privacy Policy states portability as a
  right. Deletion is implemented; export is not.
- **Development uses `sync({ alter: true })`** rather than a migration runner. There is no
  production migration path yet.
- **No production traffic, no production incident history**, and no observed attack data
  inform this document.
- **Dependencies are not continuously audited** beyond the lockfile and CI.

---

## 7. Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a public
issue:

- **Email:** support@mealrescue.app

Include the affected component, reproduction steps, and impact. Please allow reasonable
time for a fix before public disclosure. There is no bug bounty programme.

---

## 8. File map

| File | Why it matters |
|---|---|
| [`apps/backend/src/app.ts`](./apps/backend/src/app.ts) | Middleware registration order: CORS → helmet → JWT → rate limit → routes → error handler |
| [`apps/backend/src/modules/auth/auth.service.ts`](./apps/backend/src/modules/auth/auth.service.ts) | bcrypt at 12 rounds; token issuance |
| [`apps/backend/src/routes/webhook.routes.ts`](./apps/backend/src/routes/webhook.routes.ts) | Timing-safe shared-secret gate; event sets |
| [`apps/backend/src/routes/subscription.routes.ts`](./apps/backend/src/routes/subscription.routes.ts) | Entitlement verification; client-entitlement flag |
| [`apps/backend/tests/security-surface.test.ts`](./apps/backend/tests/security-surface.test.ts) | Anonymous-access, error-contract, and leak assertions |
| [`apps/backend/tests/security-cross-user.integration.test.ts`](./apps/backend/tests/security-cross-user.integration.test.ts) | Nine cross-tenant isolation assertions |
