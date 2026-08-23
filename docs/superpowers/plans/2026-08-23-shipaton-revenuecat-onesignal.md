# Shipaton Monetization & Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a complete RevenueCat-powered revenue engine (Pro subscriptions + Catvertising: Rescue Fuel, Pro Pass, Staples Shelf) and a OneSignal engagement engine (Rescue Windows, Spoiler Alert, GLM-written copy) that targets the HAMM, Catvertising, and Keep Them Coming Back awards.

**Architecture:** Three layers on the existing monorepo. (1) Mobile: `react-native-purchases` + `react-native-purchases-ui` for IAP, `react-native-google-mobile-ads` for AdMob with manual RevenueCat reward verification, `react-native-onesignal` for push. (2) Backend: RevenueCat webhook flips `users.subscription_tier`; rescue allowance consumed server-side with ad-earned credits; two idempotent claim endpoints make ad rewards server-authoritative; a node-cron scheduler learns mealtimes and scans pantry expiry, sending pushes through OneSignal's REST API with GLM-written copy. (3) Governance: paying users never touch ad code paths; hard frequency caps everywhere.

**Tech Stack:** Expo SDK 57 dev build (NO Expo Go), react-native-purchases, react-native-purchases-ui, react-native-google-mobile-ads, react-native-onesignal + onesignal-expo-plugin, Fastify + Sequelize (sync alter), node-cron, GLM-5.2 via OpenRouter (through existing `LlmClient` + `ResilientLlmClient`), Jest (backend), Turbo (`npm run lint|typecheck|test`).

## Global Constraints

- Expo Go does NOT work in this repo — verify mobile changes via `npm run android` (dev build on Pixel 7 emulator, `com.mealrescue.app`).
- Backend runs on port **3010** locally (Lyra portal owns 3000 — do not kill PID on 3000). Embedded PG on **5433**, boot via `%TEMP%\opencode\pg-verify\boot-pg.cjs`.
- ALL secrets go in gitignored `.env` files. Never commit keys. Mobile secrets use `EXPO_PUBLIC_*` or `extra` in `app.json` (public SDK keys only — RevenueCat public SDK key, AdMob app/unit IDs, OneSignal app ID are all designed to be public).
- Every LLM call MUST go through `LlmClient` (factory picks ResilientLlmClient automatically). Never call OpenAI SDK directly outside `openai-llm-client.ts`.
- Schema changes = edit Sequelize models; `sequelize.sync({alter:true})` migrates dev DB automatically at boot. No migration files needed for this plan.
- Quality gates before any commit: `npm run lint` AND `npm run typecheck` AND `npm run test` at repo root must pass (41 backend tests currently green — keep them green).
- Conventional commits (`feat:`, `test:`, `chore:` …), one commit per task.
- Anti-fatigue governance is NON-NEGOTIABLE (judges reward restraint): subscribers see zero ads; ≤2 rewarded ads/user/day; pushes respect quiet hours; ≤1 push/user/day total.

## External Account Prerequisites (manual, blocking)

Create BEFORE starting; Tasks marked ⛔ cannot be completed without them, but their code can still be written and tested with test IDs / dev flags:

1. **RevenueCat**: project "Meal Rescue", Android app linked (package `com.mealrescue.app`), entitlement `pro`, offering `default` with products `pro_monthly` ($4.99, 7-day free trial), `pro_yearly` ($39.99), `pro_lifetime` ($79.99). Copy: Public Android SDK key, Webhook auth secret. Generate a **judge promo code** (offer code `SHIPATON`).
2. **AdMob**: app entry for Android, ad units: `rewarded_interstitial_rescue_fuel`, `rewarded_interstitial_pro_pass`, `native_staples_shelf`. Enable SSV per rewarded unit with RevenueCat's callback URL (from RC dashboard → Ads → Rewards). Copy: App ID + 3 unit IDs.
3. **OneSignal**: app "Meal Rescue" (Android platform, Firebase FCM key added). Copy: App ID, REST API key.

---

## File Structure (map of everything this plan touches)

**Backend — Create:**
- `apps/backend/src/routes/webhook.routes.ts` — POST /webhooks/revenuecat (tier flip)
- `apps/backend/src/routes/ads.routes.ts` — POST /ads/credits/claim, POST /ads/pro-pass/claim, GET /ads/eligibility
- `apps/backend/src/routes/notification.routes.ts` — POST /notifications/action (outcome logging), PATCH /notifications/settings
- `apps/backend/src/lib/timing-safe.ts` — constant-time string compare
- `apps/backend/src/services/rescue-allowance.service.ts` — effectiveTier, consumeRescueAllowance, grant helpers
- `apps/backend/src/services/push/oneignal-client.ts` — thin OneSignal REST wrapper
- `apps/backend/src/services/push/notif-copy.service.ts` — GLM notification copywriter + cache + fallback
- `apps/backend/src/services/push/scheduler.service.ts` — cron engine, Rescue Windows + Spoiler Alert jobs
- `apps/backend/tests/rescue-allowance.test.ts`, `apps/backend/tests/webhook.test.ts`, `apps/backend/tests/notif-copy.test.ts`

**Backend — Modify:**
- `apps/backend/src/config/env.ts` — add REVENUECAT_WEBHOOK_SECRET, ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, AD_REWARD_CREDITS, PRO_PASS_MINUTES
- `apps/backend/src/config/constants.ts` — PUBLIC_ROUTES += webhooks; DAILY_AD_LIMITS
- `apps/backend/src/database/models/user.model.ts` — + rescueCredits, proPassUntil, quietStartHour, quietEndHour, tzOffsetMinutes
- `apps/backend/src/database/models/index.ts` — register new models
- `apps/backend/src/database/models/rescue-credit-grant.model.ts` (new), `notification-log.model.ts` (new)
- `apps/backend/src/routes/rescue.routes.ts` — consume allowance in /generate
- `apps/backend/src/app.ts` — register routes, start scheduler
- `apps/backend/.env` — new keys

**Mobile — Create:**
- `apps/mobile/src/services/purchases.service.ts` — RC init/login/entitlement
- `apps/mobile/src/services/ads.service.ts` — AdMob init, rewarded loader with RC tracking tokens, caps
- `apps/mobile/src/services/push.service.ts` — OneSignal init/login/permission
- `apps/mobile/src/hooks/useEntitlement.ts` — isPro live hook
- `apps/mobile/src/screens/PaywallScreen.tsx`
- `apps/mobile/src/components/LimitChoiceSheet.tsx` (Rescue Fuel choice UI)
- `apps/mobile/src/components/StaplesShelf.tsx` (native ad slot)

**Mobile — Modify:**
- `apps/mobile/package.json` — deps
- `apps/mobile/app.json` — plugins (onesignal-expo-plugin, react-native-google-mobile-ads config), scheme `mealrescue`, extra keys
- `apps/mobile/App.tsx` or `app/_layout.tsx` — init services post-login
- `apps/mobile/src/navigation/AppNavigator.tsx` — Paywall route + deep-link handling
- `apps/mobile/src/screens/RescueResultScreen.tsx` — Staples Shelf + limit-choice trigger
- `apps/mobile/.env` — public IDs

**Docs — Create:** `docs/shipaton/dashboard-setup.md` (screenshots checklist), `demo-script.md`

---

# PHASE A — RevenueCat Pro Foundation (HAMM)

### Task A1: Backend — timing-safe compare + env keys + webhook route

**Files:**
- Create: `apps/backend/src/lib/timing-safe.ts`, `apps/backend/src/routes/webhook.routes.ts`, `apps/backend/tests/webhook.test.ts`
- Modify: `apps/backend/src/config/env.ts`, `apps/backend/src/config/constants.ts`, `apps/backend/src/app.ts`, `apps/backend/.env`

**Interfaces:**
- Produces: `timingSafeEqualStr(a: string, b: string): boolean`; route `POST /api/v1/webhooks/revenuecat`; env `env.REVENUECAT_WEBHOOK_SECRET: string | undefined`.

- [ ] **Step 1: Write failing tests** — `apps/backend/tests/webhook.test.ts`:

```ts
import { timingSafeEqualStr } from '../src/lib/timing-safe';

describe('timingSafeEqualStr', () => {
  it('matches equal strings', () => expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true));
  it('rejects different strings', () => expect(timingSafeEqualStr('abc123', 'xyz789')).toBe(false));
  it('rejects different lengths fast-path safe', () => expect(timingSafeEqualStr('a', 'ab')).toBe(false));
});
```

Second suite (uses running app pattern from `tests/` — copy supertest bootstrap from an existing route test, e.g. `tests/auth*.test.ts`):

```ts
it('rejects webhook with bad secret', () =>
  request(app).post('/api/v1/webhooks/revenuecat').set('Authorization','Bearer wrong').send(validEventBody).expect(401));

it('flips tier to pro on INITIAL_PURCHASE', async () => {
  const u = await User.create({ id: randomUUID(), email: `${Date.now()}@t.dev`, passwordHash: 'x', subscriptionTier: 'free' });
  await request(app).post('/api/v1/webhooks/revenuecat')
    .set('Authorization', `Bearer ${process.env.TEST_RC_SECRET}`)
    .send({ api_version: '1.0', event: { type: 'INITIAL_PURCHASE', app_user_id: u.id } })
    .expect(200);
  const after = await User.findByPk(u.id);
  expect(after!.subscriptionTier).toBe('pro');
});

it('ignores non-lifecycle events', async () => { /* TEST event → tier unchanged */ });
```

- [ ] **Step 2: Run** `npm run test --workspace @meal-rescue/backend` → NEW tests FAIL (module not found). Existing 41 stay green.
- [ ] **Step 3: Implement.** `src/lib/timing-safe.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

`env.ts` — add inside envSchema after JWT block:

```ts
  // RevenueCat webhook auth (server-to-server). Optional so dev/test boot
  // without it; the webhook route rejects requests when unset.
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
```

`constants.ts` — append `'/api/v1/webhooks/revenuecat',` to PUBLIC_ROUTES array (webhook authenticates itself via shared secret).

`webhook.routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { SubscriptionTier } from '@meal-rescue/shared-types';
import { env } from '../config/env';
import { User } from '../database/models/user.model';
import { AppError } from '../lib/errors';
import { timingSafeEqualStr } from '../lib/timing-safe';

const GRANTING = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCEL']);
const REVOKING = new Set(['EXPIRATION', 'CANCELLATION', 'BILLING_ISSUE']);

interface RcEvent { type: string; app_user_id: string; product_id?: string }

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/revenuecat', async (request, reply) => {
    if (!env.REVENUECAT_WEBHOOK_SECRET) throw AppError.internal('Webhook secret not configured');
    const auth = request.headers.authorization ?? '';
    if (!timingSafeEqualStr(auth, `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`)) {
      return reply.status(401).send({ ok: false });
    }
    const event = (request.body as { event?: RcEvent }).event;
    if (!event?.app_user_id) return reply.status(200).send({ ok: true }); // ack junk, don't retry-loop
    const tier: SubscriptionTier | null =
      GRANTING.has(event.type) ? 'pro' : REVOKING.has(event.type) ? 'free' : null;
    if (tier) await User.update({ subscriptionTier: tier }, { where: { id: event.app_user_id } });
    return reply.status(200).send({ ok: true });
  });
}
```

Register in `app.ts` alongside other route registrations (copy existing registration line pattern): `await app.register(webhookRoutes, { prefix: '/api/v1' });` with its import.

`.env`: `REVENUECAT_WEBHOOK_SECRET=dev-webhook-secret-change-me`

- [ ] **Step 4: Run full backend suite** → PASS (43+ tests).
- [ ] **Step 5: Commit** `git commit -m "feat(backend): RevenueCat lifecycle webhook flips subscription tier"`

---

### Task A2: Backend — rescue allowance engine (effectiveTier + credits)

**Files:**
- Create: `apps/backend/src/services/rescue-allowance.service.ts`, `apps/backend/src/database/models/rescue-credit-grant.model.ts`, `apps/backend/tests/rescue-allowance.test.ts`
- Modify: `apps/backend/src/database/models/user.model.ts` (+`rescueCredits:integer default 0`, `proPassUntil:date null`, `quietStartHour:integer null`, `quietEndHour:integer null`, `tzOffsetMinutes:integer default 0`), `models/index.ts` (register grant model), `apps/backend/src/routes/rescue.routes.ts` (consume in `/generate`)

**Interfaces:**
- Produces: `effectiveTier(user: User): 'free'|'pro'`; `consumeRescueAllowance(user: User): Promise<{allowed: boolean; reason?: 'limit'}>`; `grantCredits(userId, txId, n): Promise<boolean>`; `grantProPass(userId, txId, minutes): Promise<boolean>` (both idempotent-by-txId, return false if already claimed); `RATE_LIMITS` reused from constants.

- [ ] **Step 1: Failing tests** (`tests/rescue-allowance.test.ts`) — cover: pro user always allowed; free user under 3 allowed; 4th rescue blocked; with `rescueCredits>0` 4th allowed + credit decremented; `grantCredits` twice same txId → second returns false; expired `proPassUntil` → effectiveTier 'free'; future `proPassUntil` → 'pro'.

```ts
it('blocks the 4th rescue of the day for free tier', async () => {
  const u = await seedUser(); // helper creates user with 3 rescues today
  expect(await consumeRescueAllowance(u)).toEqual({ allowed: false, reason: 'limit' });
});
it('spends a credit instead of blocking', async () => {
  const u = await seedUser({ rescueCredits: 2 });
  expect((await consumeRescueAllowance(u)).allowed).toBe(true);
  expect((await u.reload()).rescueCredits).toBe(1);
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `rescue-allowance.service.ts`:

```ts
import { Op } from 'sequelize';
import { RATE_LIMITS } from '../../config/constants';
import { RescueCreditGrant } from '../database/models/rescue-credit-grant.model';
import { User } from '../database/models/user.model';

export type Tier = 'free' | 'pro';

export function effectiveTier(user: Pick<User, 'subscriptionTier' | 'proPassUntil'>): Tier {
  if (user.subscriptionTier === 'pro') return 'pro';
  if (user.proPassUntil && user.proPassUntil.getTime() > Date.now()) return 'pro';
  return 'free';
}

function startOfLocalDay(tzOffsetMinutes: number): Date {
  const now = new Date();
  const local = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + tzOffsetMinutes * 60_000);
}

export async function consumeRescueAllowance(user: User): Promise<{ allowed: boolean; reason?: 'limit' }> {
  if (effectiveTier(user) === 'pro') return { allowed: true };
  const used = await user.countRescues({
    where: { createdAt: { [Op.gte]: startOfLocalDay(user.tzOffsetMinutes ?? 0) } },
  });
  if (used < RATE_LIMITS.free.rescuesPerDay) return { allowed: true };
  if ((user.rescueCredits ?? 0) > 0) {
    await user.decrement('rescueCredits');
    return { allowed: true };
  }
  return { allowed: false, reason: 'limit' };
}

async function claimOnce(userId: string, txId: string): Promise<boolean> {
  try {
    await RescueCreditGrant.create({ id: crypto.randomUUID(), userId, adTransactionId: txId });
    return true;
  } catch (e) { // unique violation = replay
    return false;
  }
}

export async function grantCredits(userId: string, txId: string, amount: number): Promise<boolean> {
  if (!(await claimOnce(userId, `credits:${txId}`))) return false;
  await User.increment({ rescueCredits: amount }, { where: { id: userId } });
  return true;
}

export async function grantProPass(userId: string, txId: string, minutes: number): Promise<boolean> {
  if (!(await claimOnce(userId, `propass:${txId}`))) return false;
  const until = new Date(Date.now() + minutes * 60_000);
  await User.update({ proPassUntil: until }, { where: { id: userId, proPassUntil: null } });
  return true;
}
```

Note: adjust `crypto.randomUUID()` import (`node:crypto`), and confirm association name for rescue count via grep `hasMany` in user.model.ts (likely `user.countRescues` — adapt to actual alias, e.g. `countRescueRecords`). Grant model: `{ id, userId, adTransactionId UNIQUE, createdAt }` following the exact style of an existing simple model (copy `feedback.model.ts` head as template).

Wire into `rescue.routes.ts` `/generate` handler BEFORE pipeline call:

```ts
const user = await User.findByPk(request.user.sub);
if (!user) throw AppError.unauthorized();
const allowance = await consumeRescueAllowance(user);
if (!allowance.allowed) {
  throw new AppError({
    category: ErrorCategory.RATE_LIMIT_EXCEEDED, code: 'DAILY_RESCUE_LIMIT',
    message: 'Daily free rescue limit reached', statusCode: 429,
    recoverable: true, suggestedAction: 'Watch an ad for +2 rescues or upgrade to Pro',
  });
}
```

- [ ] **Step 4: Suite green. Step 5: Commit** `feat(backend): server-authoritative rescue allowance with ad credits and pro pass`

---

### Task A3: Backend — ads claim + eligibility routes

**Files:** Create `apps/backend/src/routes/ads.routes.ts`; Modify `app.ts` (register), `.env` (+`AD_REWARD_CREDITS=2`, `PRO_PASS_MINUTES=60`); `env.ts` (+those two, coerced ints with defaults above).

**Interfaces:** Produces `POST /api/v1/ads/credits/claim {adTransactionId:string} → {granted:boolean, rescueCredits:number}`; `POST /api/v1/ads/pro-pass/claim {adTransactionId} → {granted:boolean, proPassUntil:string|null}`; `GET /api/v1/ads/eligibility → {showAds:boolean, rewardedToday:number, remaining:number}`.

- [ ] **Step 1: Extend `tests/rescue-allowance.test.ts`** with route tests: claim grants +2; duplicate txId → `{granted:false}`; eligibility counts claims today vs `DAILY_AD_LIMITS.rewardedPerDay = 2`.
- [ ] **Step 2: RED. Step 3: Implement** — routes call `grantCredits/grantProPass` from Task A2, read counters from `RescueCreditGrant.count({where:{userId, createdAt >= startOfLocalDay}})`. Eligibility `showAds = effectiveTier(user)==='free'`.
- [ ] **Step 4: GREEN. Step 5: Commit** `feat(backend): idempotent ad reward claim endpoints`

---

### Task A4: Mobile — RevenueCat SDK service + entitlement hook

**Files:**
- Create: `apps/mobile/src/services/purchases.service.ts`, `apps/mobile/src/hooks/useEntitlement.ts`
- Modify: `apps/mobile/package.json` (`npx expo install react-native-purchases react-native-purchases-ui`), `apps/mobile/app.json` (add `"scheme": "mealrescue"` if absent), `apps/mobile/.env` (`EXPO_PUBLIC_REVCAT_ANDROID_SDK_KEY=goog_...`), post-login init point in `App.tsx`/`app/_layout.tsx`

⚠️ **First step: verify current API names against docs** (`context7` → RevenueCat/react-native-purchases: configure, logIn, getCustomerInfo, addCustomerInfoListener; adjust snippets below if renamed).

- [ ] **Step 1: Docs check + install.**
- [ ] **Step 2: Implement** `purchases.service.ts`:

```ts
import { Platform } from 'react-native';
import { CustomerInfo, LOG_LEVEL, Purchases } from 'react-native-purchases';

const PRO_ENTITLEMENT = 'pro';
let configured = false;

export async function initPurchases(): Promise<void> {
  if (configured || !process.env.EXPO_PUBLIC_REVCAT_ANDROID_SDK_KEY) return;
  await Purchases.setLogLevel(LOG_LEVEL.INFO);
  if (Platform.OS === 'android') {
    await Purchases.configure({ apiKey: process.env.EXPO_PUBLIC_REVCAT_ANDROID_SDK_KEY });
  }
  configured = true;
}

export async function identifyPurchases(userId: string): Promise<void> {
  if (!configured) return;
  const { info } = await Purchases.logIn(userId);
  return void info;
}

export function hasPro(info: CustomerInfo | null): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT];
}

export async function fetchCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function onCustomerInfoChanged(cb: (info: CustomerInfo) => void): () => void {
  return Purchases.addCustomerInfoListener((i) => cb(i));
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
```

Call `initPurchases()` then `identifyPurchases(authState.user.id)` right after successful login/register in the auth flow (grep `signIn`/`register` in `services/auth.api.ts` consumer — the auth store — and add the two awaits; on logout call `Purchases.logOut()`).

- [ ] **Step 3: Implement** `useEntitlement.ts`:

```ts
import { useEffect, useState } from 'react';
import type { CustomerInfo } from 'react-native-purchases';
import { fetchCustomerInfo, hasPro, onCustomerInfoChanged } from '../services/purchases.service';
import { useAuthStore } from '../store/auth-store'; // verify exact path/name via Glob src/store/*

export function useEntitlement(): { isPro: boolean; loading: boolean } {
  const serverTier = useAuthStore((s) => s.user?.subscriptionTier);
  const [rcPro, setRcPro] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    fetchCustomerInfo().then((i) => mounted && setRcPro(hasPro(i))).catch(() => {});
    const off = onCustomerInfoChanged((i) => setRcPro(hasPro(i)));
    return () => { mounted = false; off(); };
  }, []);
  return { isPro: rcPro || serverTier === 'pro', loading };
}
```

- [ ] **Step 4: Verify** `npm run typecheck -w @meal-rescue/mobile` clean; rebuild dev client (`npm run android`) — app boots, RC logs "configured" with TEST/generic key placeholder acceptable.
- [ ] **Step 5: Commit** `feat(mobile): RevenueCat SDK init, identity linking, live entitlement hook`

---

### Task A5: Mobile — Paywall screen with GLM-personalized copy

**Files:** Create `PaywallScreen.tsx`; Backend: `paywall.routes.ts` (GET /api/v1/paywall/copy) + tiny `paywall-copy.service.ts` reusing `LlmClient`; Modify `AppNavigator.tsx` (route `'Paywall'`), `.env` backend none.

**Interfaces:** Backend returns `{headline: string, subline: string, bullets: string[], source: 'glm'|'template'}`. Mobile renders `react-native-purchases-ui` `PaywallView` if available (docs check), else custom screen listing offerings via `Purchases.getOfferings()`; purchase → await `getCustomerInfo` → success haptic + dismiss.

- [ ] **Step 1: Backend failing test** — copy service: with heuristic fallback (no network in CI) returns template mentioning top rescued food; schema validated. Implement service:

```ts
const SCHEMA = z.object({
  headline: z.string().min(10).max(80),
  subline: z.string().min(20).max(160),
  bullets: z.array(z.string().max(70)).length(3),
});
const SYSTEM = `You write paywall copy for Meal Rescue, an app that rescues neglected meals with minimal additions. Voice: warm friend, zero guilt, NO health claims, NO calorie talk, NO emoji. Output JSON {headline<=80chars, subline<=160, bullets[3]<=70 each}. Personalize with the user's recent foods.`;
// userContent: {recentFoods: string[], rescuesThisWeek: number}
```

Template fallback: `"Your leftover ${food} deserves better than the bin."`
- [ ] **Step 2: GREEN. Commit backend** `feat(backend): GLM-personalized paywall copy endpoint`.
- [ ] **Step 3: Mobile PaywallScreen** — fetch copy, render offerings monthly/yearly/lifetime with trial badge ("7 days free"), purchase buttons calling `Purchases.purchaseProduct`, loading/error states, `Restore` link (calls `restorePurchases`), legal footer line. Navigate here from Profile gear icon + anywhere a 429 lands (Task B8 wires the main trigger).
- [ ] **Step 4: Emulator check** — open Paywall tab via Profile; with sandbox/no products shows graceful "Offerings unavailable in sandbox" empty state (must NOT crash).
- [ ] **Step 5: Commit** `feat(mobile): paywall screen with personalized copy + offerings`

---

### Task A6: Docs — dashboard setup + judge promo checklist

**Files:** Create `docs/shipaton/dashboard-setup.md`.
- [ ] Write the manual RC dashboard steps (entitlement/offering/trial/promo code `SHIPATON`/webhook URL `https://<prod-host>/api/v1/webhooks/revenuecat`) + AdMob SSV steps + OneSignal platform steps, each with screenshot placeholders. Commit `docs: sponsor dashboard setup runbook`.

---

# PHASE B — Catvertising Engine

### Task B1: Mobile — ads.service with RC-tracked rewarded interstitials + caps

**Files:** Create `apps/mobile/src/services/ads.service.ts`; Modify `package.json` (`npx expo install react-native-google-mobile-ads`), `app.json` plugin config:

```json
["react-native-google-mobile-ads",
  { "androidAppId": "ca-app-pub-XXXX~YYYY",
    "iosAppId": "PLACEHOLDER", "delayAppMeasurementInit": true }]
```

`.env`: `EXPO_PUBLIC_ADAPP_ANDROID=ca-app-pub-XXXX~YYYY`, `EXPO_PUBLIC_ADU_RESUCE_FUEL`, `EXPO_PUBLIC_ADU_PRO_PASS`, `EXPO_PUBLIC_ADU_STAPLES` (use Google **TestIds** while unset).

⚠️ Docs check (context7: react-native-google-mobile-ads — RewardedInterstitialAd events, `generateRewardVerificationToken`/`pollRewardVerification` exact names in installed react-native-purchases version).

**Interfaces:** Produces `showRewarded(placement: 'rescue_fuel'|'pro_pass'): Promise<'earned'|'closed'|'unavailable'>` — internally: eligibility check via backend `GET /ads/eligibility` (skip entirely when isPro or remaining===0 → resolve `'unavailable'`), create request with `generateRewardVerificationToken()` customData attached per RC manual-integration guide, poll verification after earned, expose result + `lastVerifiedTxId`.

- [ ] Steps: docs check → install/plugin → implement service (single module, ≤150 lines) → typecheck → emulator smoke: test ad renders and closes → commit `feat(mobile): RC-tracked rewarded ads with server-gated caps`.

### Task B2: Rescue Fuel (choice sheet + credit spend loop)

**Files:** Create `components/LimitChoiceSheet.tsx`; Modify `RescueResultScreen.tsx` (or wherever rescue generation is triggered — grep `rescueApi.generate`): catch 429 `DAILY_RESCUE_LIMIT` → open sheet with two cards: **Watch 30s → +2 rescues** / **Go Pro → unlimited** (deep link to Paywall). After `'earned'`: `POST /ads/credits/claim {adTransactionId}` → retry generation once.

- [ ] Emulator E2E: burn 3 rescues → 4th shows sheet → watch test ad → claim succeeds → rescue generates. Commit `feat(mobile): Rescue Fuel rewarded-ad choice at rescue limit`.

### Task B3: Pro Pass (60-min Pro via SSV reward)

**Files:** Modify `LimitChoiceSheet.tsx` (third subtle option "Try Pro free for 60 min — watch ad"), `useEntitlement.ts` (also treat server `proPassUntil>now` as pro — fetch `/me` refresh after claim), backend `ads.routes.ts` already handles claim.

- [ ] Manual RC dashboard step recorded in `dashboard-setup.md`: Ads→Rewards rule mapping `rewarded_interstitial_pro_pass` → entitlement `pro`, 60 minutes (SSV enforced).
- [ ] Emulator E2E: watch → claim → Profile shows PRO badge → after 60 min (or `adb shell date -s` skip-ahead on emulator… note: emulator clock changes break FCM; instead temporarily set `PRO_PASS_MINUTES=2` in dev .env to observe expiry) reverts to free. Commit `feat: Pro Pass temporary entitlement end-to-end`.

### Task B4: Staples Shelf native ad (contextual missing-ingredients slot)

**Files:** Create `components/StaplesShelf.tsx`; Modify `RescueResultScreen.tsx` — render shelf ONLY when `!isPro && recommendation.additions.length>0`; heading literally reuses the existing "YOU NEED" list, native ad card below labeled **"Sponsored staples"** with `NativeAdView` (image/headline/advertiser), `requestNonPersonalizedAdsOnly: true`.

Governance invariants coded here: never render for pro (hook), never more than one shelf/screen, hidden when ad fails to load (zero layout shift).
- [ ] Emulator: free user sees labeled native test ad under YOU NEED; pro toggle hides it. Commit `feat(mobile): contextual Staples Shelf native ad for free tier`.

### Task B5: Ad governance audit + Ad Charts placements

- [ ] Grep all `showRewarded(` call sites — assert exactly 2 (fuel, pro_pass). Assert `ads.service.ts` refuses when `isPro`. Add backend unit test: 3rd claim same day → eligibility.remaining 0. Update `dashboard-setup.md` with expected Ad Charts placement names. Commit `chore: ad frequency governance audit`.

---

# PHASE C — OneSignal Engagement Engine

### Task C1: Mobile — OneSignal init, login, permission UX

**Files:** Create `src/services/push.service.ts`; Modify `package.json` (`npx expo install react-native-onesignal onesignal-expo-plugin`), `app.json` plugins += `["onesignal-expo-plugin", {"mode": "development"}]`, `extra.onesignalAppId`; `.env` `EXPO_PUBLIC_ONESIGNAL_APP_ID`; post-login `OneSignal.login(user.id)` next to `identifyPurchases`.

```ts
import { OneSignal } from 'react-native-onesignal';
export function initPush(appId: string): void { OneSignal.initialize(appId); }
export async function enablePush(userId: string): Promise<void> {
  OneSignal.login(userId);
  const granted = OneSignal.Notifications.getPermissionVariable('granted') ?? false;
  if (!granted) await OneSignal.Notifications.requestPermission(true);
}
```

Permission ask deferred until after FIRST successful rescue (moment of value — judges notice good permission hygiene); add one-line explanation UI before the OS dialog.
- [ ] Emulator: accept → OneSignal dashboard "Subscriptions" shows device with external_id = userId. Commit `feat(mobile): OneSignal SDK with value-timed permission prompt`.

### Task C2: Backend — push client, notification log, settings route

**Files:** Create `services/push/onesignal-client.ts`, `database/models/notification-log.model.ts` (unique index `(userId, type, dueDate)`), `routes/notification.routes.ts` (PATCH /notifications/settings {quietStartHour,quietEndHour,tzOffsetMinutes}; POST /notifications/action {notificationLogId, action}); Modify models/index.ts, app.ts, env.ts (+`ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`), `.env`.

**Interface (produces):** `sendUserPush({userId,type,dueDate,title,body,buttons?,data?}): Promise<'sent'|'deduped'|'skipped_quiet'|'disabled'>` — writes NotificationLog first (unique-catch → deduped), checks quiet hours using user.tzOffsetMinutes, then OneSignal REST:

```ts
fetch('https://api.onesignal.com/notifications', {
  method: 'POST',
  headers: { Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    app_id: env.ONESIGNAL_APP_ID,
    include_aliases: { external_id: [userId] },
    target_channel: 'push',
    headings: { en: title }, contents: { en: body },
    buttons: buttons ?? [],
    data: { ...data, notificationLogId },
  }),
});
```

(Jest: mock global.fetch; assert dedupe + quiet-hour branches.)
Commit `feat(backend): OneSignal push client with dedupe ledger and quiet hours`.

### Task C3: GLM notification copywriter

**Files:** Create `services/push/notif-copy.service.ts`; Test `tests/notif-copy.test.ts`.

**Interface:** `writeCopy(type: 'rescue_window'|'spoiler_alert', ctx: Record<string,unknown>): Promise<{title,body}>` — LlmClient JSON schema `{title≤48, body≤110}`, system prompt locks voice ("helpful kitchen friend; specific dish name in title when known; no health claims, no guilt, no clickbait, no emojis"), 24h in-memory cache keyed `` `${type}:${userIdHash}:${dateKey}` ``, deterministic fallbacks:

```
rescue_window: title `Quick win before ${mealtimeLabel}` body `Your ${foods} can become ${dish} in ${mins} min.`
spoiler_alert: title `${item} expires soon` body `Turn it into dinner in about ${mins} minutes — here's how.`
```

Tests: schema-valid output from heuristic client; cache hit avoids second llm call (spy).
Commit `feat(backend): GLM-personalized push copy with cache + fallback`.

### Task C4: Scheduler — Rescue Windows (predictive mealtime)

**Files:** Create `services/push/scheduler.service.ts` (node-cron `*/5 * * * *`, singleton started from `app.ts` after DB connect; guard `env.NODE_ENV !== 'test'`); Modify `package.json` backend (+`node-cron`, `@types/node-cron`).

Logic: per user (opt-out flag `pushEnabled` default true on users), compute median mealtime hour/min from last 14 days `Meals.createdAt` (SQL aggregate via sequelize literal; ≥5 samples required else skip — cold-start protection); fire window `[median-30m, median+10m]` intersected with awake hours; `sendUserPush` with GLM copy ctx `{foods: top3 pantry items joined with fridge-negotiator composer top suggestion}`; skip if any push sent today (ledger query).

Test: pure function `computeRescueWindow(dates: Date[]): {hour,min}|null` — median math incl. wraparound midnight cases.
Commit `feat(backend): learned-mealtime Rescue Window scheduler`.

### Task C5: Scheduler — Spoiler Alert (expiry-driven)

Same file: scan `Pantries.expiresAt` within next 24h, not yet notified today (ledger), join ingredient name → reuse fridge-negotiator composer's best match containing that item for `steps` count + time estimate in ctx. Cap: max 1 spoiler/user/day; global loop batched ≤50 users/run.
Test: fixture rows → selects correct item, respects dedupe. Commit `feat(backend): pantry expiry Spoiler Alert job`.

### Task C6: Deep links + outcome logging (Journeys backbone)

**Files:** Modify `AppNavigator.tsx` — `linking` config prefix `mealrescue://` route `rescue/:pantryItemId` opening CaptureScreen prefilled; OneSignal listener `Notifications.addEventListener('click', ...)` reads `data.route` → navigate. `notification.routes.ts` action endpoint already logs; mobile posts `{notificationLogId, action:'opened'|'cooked'|'snoozed'}`; snooze inserts ledger row `dueDate=today+1d` suppressing tomorrow's push (closing the loop Friendy+-style).
Emulator: `adb shell am start -W -a android.intent.action.VIEW -d "mealrescue://rescue/ITEM_ID"`. Commit `feat: push deep links with snooze outcome loop`.

---

# PHASE D — Judge Readiness

### Task D1: Full E2E dress rehearsal + demo script
- [ ] Script in `docs/shipaton/demo-script.md` mirroring the 2-min video beats: capture sad noodles → rescue (real GLM) → 429 → Rescue Fuel ad → credit → rescue #4 → Pro Pass → badge flips → Spoiler Alert arrives with dish name → tap Cook it → cook → feedback → weekly impact line. Each beat: exact emulator command + expected screen.
- [ ] Run `npm run lint && npm run typecheck && npm run test` — all green; `git log --oneline` review; final commit `docs: shipaton demo script`.

---

## Self-Review Notes
- Coverage: HAMM (A1-A6), Catvertising (B1-B5 incl. governance + Staples Shelf), Keep-Them-Coming-Back (C1-C6 incl. anti-fatigue ledger), submission requirements (promo code in A6, trial in A5). Peace Prize narrative rides C5 impact stats (already in ProfileScreen insights).
- Type consistency checked: `consumeRescueAllowance`/`grantCredits`/`grantProPass` signatures identical across A2/A3/B2/B3; `sendUserPush` signature consistent across C2-C5.
- Known execution-time verifications flagged inline with ⚠️ (RN library API drift; user-model association alias; auth-store path) — each has a concrete locate/adjust step, not a TODO.
