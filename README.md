<div align="center">
  <img src="assets/Logo.png" alt="Meal Rescue logo" width="160" />

  # Meal Rescue

  ### The smallest change that makes a meal better.

  An AI meal-optimization app that starts with the food you already have, finds **one practical improvement**, and learns from what happens next.

  <p>
    <a href="https://github.com/louji2308/Meal-Rescue/actions/workflows/ci.yml"><img src="https://github.com/louji2308/Meal-Rescue/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
    <a href="https://www.shipaton.com/categories/next-gen-award"><img src="https://img.shields.io/badge/Shipaton%202026-Next%20Gen%20Award-orange.svg" alt="Shipaton 2026 Next Gen Award" /></a>
    <a href="./docs/PAYWALL.md"><img src="https://img.shields.io/badge/monetization-RevenueCat-red.svg" alt="Monetization powered by RevenueCat" /></a>
  </p>

  <sub>Expo · React Native · Fastify · PostgreSQL · Redis · TypeScript · RevenueCat</sub>

  <p><a href="https://youtu.be/sHj4hfR-lYE"><b>▶ Watch the 2-minute demo</b></a> · <a href="https://devpost.com/software/meal-rescue">Devpost submission</a></p>

</div>

<p align="center">
  <a href="#submission-map">Submission map</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#monetization--revenuecat">Monetization and RevenueCat</a> ·
  <a href="#run-it">Run it</a>
</p>

---

## The idea in 30 seconds

| | |
|---|---|
| **Problem** | People often need a *better* meal, not an entirely *different* one. Most tools start by asking what to cook; Meal Rescue starts from the meal that already exists. |
| **Interaction** | Show the meal (photo, text, or voice) → say what you want from it → say what is realistic right now (time, cooking, budget, cleanup). |
| **Decision engine** | Bounded candidates → hard constraints enforced in code → LLM ranks and explains → validation → **one best move + alternatives** (or an intentional *keep as is*). |
| **Learning loop** | Decision + satisfaction feedback → context-scoped taste memory → used on future rescues. |
| **Business model** | Free tier (3 lifetime rescues + rewarded ads) → Pro through **RevenueCat**: $4.99/month · $39.99/year · $79.98 lifetime. |
| **Engineering thesis** | LLMs rank and explain. Deterministic code owns safety, feasibility, validation, and fallback behaviour. |

**Illustrative example** (written for this README, not a recorded model output):

| You show | You say | Meal Rescue returns |
|---|---|---|
| A bowl of plain pasta with tomato sauce | `PRESERVE` · 5 minutes · no cooking · minimal cleanup | One *addition* that fits those limits (for instance, a handful of baby spinach stirred through the hot pasta), two alternatives, and a short explanation of why it ranked first. |

---

## Submission map

Meal Rescue is built for the **Shipaton 2026 Next Gen Award**, which is judged from the demo video and this public repository ([official rules](https://revenuecat-shipaton-2026.devpost.com/rules)). The table maps each judging question to the evidence in this repo.

| Judging question (paraphrased from the rules) | Where to look |
|---|---|
| Is the idea clear, useful, and original? Does it solve a real problem? | [The idea](#the-idea-in-30-seconds) · [How Meal Rescue differs](#how-meal-rescue-differs) · [How it works](#how-it-works) |
| Is there meaningful progress toward a working app, with the core functionality clear from the video and code? | [Project status](#project-status) · [Run it](#run-it) · [Verification](#verification) · `apps/backend/tests/` |
| Does it use RevenueCat thoughtfully? | [Monetization and RevenueCat](#monetization--revenuecat) · [**docs/PAYWALL.md**](./docs/PAYWALL.md) |
| Are the technical choices, product thinking, and care visible? | [Architecture](#architecture) · [Engineering decisions](#engineering-decisions) · [Safety, privacy, and responsible AI](#safety-privacy-and-responsible-ai) |
| Is it open source? | MIT — see [LICENSE](./LICENSE) |

Two companion documents are worth reading next: **[SECURITY.md](./SECURITY.md)** (threat model, the controls actually in place, and the test evidence behind each) and **[docs/PAYWALL.md](./docs/PAYWALL.md)** (pricing, entitlements, webhooks, unit economics).

**Submitted revision:** [`1fda0b7`](https://github.com/louji2308/Meal-Rescue/commit/1fda0b710b68607d7f858c4393255b6b85b437cf) — committed 30 Sep 2026 20:57 UTC, minutes before the Devpost deadline. Documentation corrections made afterwards are documented in later commits; the submitted app code is unchanged from that revision.


---

## How Meal Rescue differs

| | Typical recipe generator | **Meal Rescue** |
|---|---|---|
| Starting point | Ingredients or a craving | The meal in front of you |
| Output | A whole new recipe | One minimal change — or an explicit *keep as is* |
| Who owns feasibility and safety | Often the model | Deterministic code; the model only ranks and explains |
| After the meal | Usually nothing | Satisfaction feedback updates context-scoped taste memory |

**Problem evidence.** This started as an entry in Abbey's Kitchen's "Best Meal Planning Apps" challenge, where the reviewer's complaint was that existing tools ask what to cook before understanding the meal you already have. The framing in this README is the hypothesis that came out of that challenge, set out to be tested by the build.

---

## How it works

```mermaid
flowchart LR
    A[Photo / Text / Voice] --> B[Structured Meal Input]
    B --> C[Intent]
    C --> D[Reality Constraints]
    D --> E[Craving Guardrail]
    E --> F[Candidate Generation]
    F --> G[Deterministic Constraint Filter]
    G --> H[LLM Ranking + Explanation]
    H --> I[Final Validation]
    I --> J[Best Move + Alternatives]
    J --> K[User Decision]
    K --> L[Feedback + Satisfaction]
    L --> M[Taste Memory / Meal Memory]
    M --> F
```

The trust hierarchy is the core design decision:

```text
User constraints
      ↓
Deterministic business rules
      ↓
Validated candidate set
      ↓
LLM ranking / explanation
      ↓
Application validation
      ↓
Persisted decision + provenance
```

### The Rescue engine, step by step

| # | Step | Owner |
|---|---|---|
| 1 | **Capture** — photo, text, or voice. Detected items are shown for editing before anything continues. | Vision model proposes; **user confirms** |
| 2 | **Intent** — `SATISFY`, `PRESERVE`, `LIGHTEN`, `DECIDE`, or `NO_COOK` | User |
| 3 | **Reality** — time (5 / 15 / 30+ min), cooking ability, budget, cleanup tolerance, hard constraints; optional craving guardrail | User |
| 4 | **Candidates** — `addition`, `substitution`, `modification`, or `keep_as_is` | Backend |
| 5 | **Hard constraints** — time, budget, cooking allowed, equipment, avoid-list, allergies, diet, preserve-original | **Deterministic code** |
| 6 | **Rank + explain**, then validate → one best move + alternatives | LLM ranks and explains; code validates; heuristic fallback |
| 7 | **Decision + satisfaction** → taste memory update | User + code |

Step 4 is **pure deterministic code — no LLM**. `CandidateGeneratorService.generateCandidates` concatenates five strategy functions in a fixed order — `componentAdditions`, `cuisineEnhancements`, `minimalSubstitutions`, `favoriteAdditions`, `cultureAlignedAdditions` — then deduplicates and caps the list at 12 (`MAX_CANDIDATES`). The LLM is not consulted until step 6, where it only ranks and explains this pre-built list. See [`candidate-generator.service.ts:52-70`](./apps/backend/src/services/candidate-generator.service.ts).


<details>
<summary><b>Engine details: ranking rules, provenance, vision pipeline, provider abstraction</b></summary>

#### Ranking and validation

- The LLM receives an already-constrained candidate set and answers one question: *among the options that are actually feasible, which best satisfies the intent, and how should it be explained?*
- Returned candidate IDs are validated. **Unknown or invented IDs are dropped.** Candidates the model omits are restored with a neutral score, so the result stays grounded in the backend-generated solution space.
- If model ranking fails, a **deterministic ranking fallback** takes over.
- The allergy and feasibility path **fails closed** when information is insufficient for a safe decision.

#### Provenance (stored with every result)

Provider · model · prompt version · pipeline version · ranking version · whether fallback was used · processing time · validation outcome.

Prompt identifiers are versioned (for example `v3.0-food-recognizer`, `v1.0-kitchen-analyzer`, `v2.0-mr1`, `v2.1-mr2`), so prompt changes are observable alongside application versions.

#### Provider abstraction

```text
Domain service
      │
      ▼
   LlmClient
      │
 ┌────┴───────────────┐
 ▼                    ▼
OpenAI-compatible   Heuristic
client               fallback
 │                    │
 ▼                    └── zero-network deterministic path
Provider / model
```

The composition root selects the implementation at startup; domain services never import a provider SDK. The OpenAI-compatible client supports configurable provider/model selection, Zod-validated structured JSON, transport and application retries, and per-request fallback to the heuristic client (marked as fallback in provenance). The heuristic client deliberately uses deterministic rules and local data rather than imitating an LLM.

#### Vision pipeline

```text
Image bytes → SHA-256 fingerprint → Redis cache lookup
   ├─ hit  → structured result
   └─ miss → image optimization → vision model → Zod validation → 24-hour contextual cache
```

The cache key is scoped by the image plus contextual hints (such as cuisine); the kitchen-scanning path uses its own namespace.

</details>

---

## Project status

| Surface | What it does | Status |
|---|---|---|
| **Rescue** | Capture → intent → reality → craving → recommendation → feedback → satisfaction | Implemented; constraint, ranking, fallback, and learning behaviour covered by tests |
| **Kitchen** | Pantry, leftovers, expiry tracking, "What can I make?", photo identification with an editable review step | Implemented |
| **Meal Plan** (Meal Memory) | Slot ranking, plan generation/refinement, meal rules, event memory, post-meal feedback | Implemented; persisted plan state is deterministic |
| **Common Table** | Household convergence: shared base, latest viable split point, honest fallback | Implemented (bowl, stir-fry, pasta, skillet, platter patterns) |
| **Taste Journal** | Shows what the system has learned; dismiss / correct / forget | Implemented |
| **Monetization** | Free/Pro tiers, allowances, rewarded-ad credits, RevenueCat sync and webhooks | Backend implemented and tested; live store purchases need real keys ([details](#monetization--revenuecat)) |
| **Notifications** | OneSignal push, quiet hours, duplicate suppression, snooze, in-app inbox | Implemented; dry-run when credentials are absent |

---

## Monetization & RevenueCat

> **RevenueCat is the purchase and entitlement layer.** The backend decides what each tier may do. The full design, trust model, testing paths, and unit-economics framework live in **[docs/PAYWALL.md](./docs/PAYWALL.md)**.

<p align="center">
  <img src="assets/Paywall.png" alt="Meal Rescue Pro paywall showing Monthly, Yearly, and Lifetime plans" width="300" />
</p>

### The offer

| Plan | Price | Notes |
|---|---|---|
| Monthly | **$4.99** / month | |
| Yearly | **$39.99** / year | ≈ $3.33/month, about 33% below twelve monthly payments |
| Lifetime | **$79.98** once | Two years of the yearly plan; about 16 months of monthly |

A free **1-hour Pro Pass** (one rewarded ad) is always offered as a no-card alternative.

### The free tier

| Allowance | Amount | Renews? |
|---|---|---|
| AI rescues | 3 for the lifetime of the account | **No** |
| Meal Plan | 1 full plan day (the first day of the first plan) | **No** — later days need Pro |
| Cook for the Table | 1 added household member | **No** — more members need Pro (`MEMBER_LIMIT_EXCEEDED`, HTTP 403) |
| Rewarded ads | Up to 2/day → **+2 rescue credits** each, *or* a 60-minute Pro Pass | The *ad cap* resets at local midnight; credits themselves never expire |

Pro removes every ceiling: unlimited rescues, the whole week planned at once, unlimited household members.

### How RevenueCat fits

```mermaid
sequenceDiagram
    participant App as Mobile app
    participant RC as RevenueCat
    participant API as Fastify API
    participant DB as PostgreSQL
    App->>RC: Purchase a package
    RC-->>App: Customer info (entitlements)
    App->>API: POST /api/v1/subscription/sync
    API->>API: Confirm tier server-side
    API->>DB: Persist confirmed tier
    API-->>App: Effective tier + allowances
    RC->>API: Webhook (renewal, expiration, ...)
    API->>DB: Update tier
```

| Layer | Implementation |
|---|---|
| Purchases | RevenueCat React Native SDK. Live prices come from store packages; static price labels render only when packages are unavailable. |
| Tier confirmation | `POST /api/v1/subscription/sync` — Pro unlocks only after the backend confirms it. |
| Webhooks | RevenueCat webhook handling, authenticated with `REVENUECAT_WEBHOOK_SECRET`. |
| Allowances and credits | Owned by the backend (`rescue-allowance.service.ts`); the client is never trusted. |
| Rewarded ads | AdMob. Grants are **idempotent**; `AD_REWARD_CREDITS` (default 2) and `PRO_PASS_MINUTES` (default 60) are configurable. |
| Client state | `monetization.store` holds tier and credits for display. |

### Verify RevenueCat locally

RevenueCat's **Test Store** (API keys prefixed `test_`) runs the full purchase flow without Apple or Google developer accounts, which makes it the right local path for this project. Two cautions from RevenueCat's own docs:

- In Expo Go the SDK runs in **Preview API Mode** (mocked native calls). Real purchase flows need a **development build** (`expo run:android` / `expo run:ios`).
- A Test Store key must never ship in a release build.

Step-by-step instructions, including what to check in the RevenueCat dashboard, are in [docs/PAYWALL.md → Testing](./docs/PAYWALL.md#7-environments-and-testing).

The checked-in config deliberately ships **no** working key: [`apps/mobile/.env.example`](./apps/mobile/.env.example) leaves `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY` empty, and the real Test Store key lives only in `apps/mobile/.env`, which is gitignored ([`.gitignore:34`](./apps/mobile/.gitignore)). A reviewer cannot pick up a live purchase path from the repository alone — the Test Store flow activates only when `EXPO_PUBLIC_REVENUECAT_ALLOW_TEST_STORE=1` is set locally ([`revenuecat.service.ts:33`](./apps/mobile/src/services/revenuecat.service.ts)).

---

## Run it

The Next Gen rules require the repository to contain everything needed to make the project functional. This is that path.

**Prerequisites:** Node.js 20+, npm 11.6.2 (declared by the repo), Docker with Compose. PostgreSQL 15 and Redis 7 only if you run them outside Docker.

```bash
# 1. Install workspace dependencies
npm ci

# 2. Start PostgreSQL, Redis, and the API (http://localhost:3010)
docker compose up -d
```

| Endpoint | URL |
|---|---|
| API | `http://localhost:3010` |
| Swagger / OpenAPI | `http://localhost:3010/docs` |
| Health | `http://localhost:3010/health` |

`docker compose up -d` supplies its own environment, so the backend `.env` is only read when you run the backend directly.

<details>
<summary><b>Run the backend directly (without Docker for the API)</b></summary>

```bash
cp apps/backend/.env.example apps/backend/.env      # PowerShell: Copy-Item
```

```env
DATABASE_URL=postgresql://meal_rescue:local_password@localhost:5432/meal_rescue_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-this-in-development
```

```bash
npm run dev --workspace @meal-rescue/backend
```

Port note: the direct-run default is `PORT=3000`; Docker exposes **3010**. Make your mobile `EXPO_PUBLIC_API_BASE_URL` match whichever you use. For model-backed AI, also set the API key and model variables (see [Environment reference](#environment-reference)).

</details>

### Mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env        # PowerShell: Copy-Item
npm run dev --workspace @meal-rescue/mobile         # Metro
```

| Target | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:3010` |
| iOS simulator | `http://localhost:3010` |

**Optional integrations**

- **OneSignal** (`EXPO_PUBLIC_ONESIGNAL_APP_ID`): leave blank and push reminders are disabled.
- **RevenueCat**: leave the purchase keys blank and in-app purchases stay disabled. See [Verify RevenueCat locally](#verify-revenuecat-locally).
- **AdMob — required for native builds.** Set `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` and `EXPO_PUBLIC_ADMOB_IOS_APP_ID` before `expo run:android` / `expo run:ios`; the native Google Mobile Ads SDK crashes on launch without them. Metro alone only logs a warning.

This section has been followed on this machine but **not** timed on a clean clone — no minimum-viable runtime or minimum install time is claimed. CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) is the reproducible gate: it installs from lockfile and runs the backend suite without local state.

---

## Architecture

```mermaid
flowchart TB
    subgraph Client[Mobile Client]
      RN[Expo / React Native]
      NAV[React Navigation]
      RQ[React Query]
      Z[Zustand Stores]
      RN --> NAV
      RN --> RQ
      RN --> Z
    end

    subgraph API[Fastify API]
      ROUTES[23 Route Modules]
      AUTH[Auth / JWT]
      DOMAIN[Domain Services]
      DECISION[Decision + Constraint Engines]
      AI[AI Abstraction Layer]
      MONETIZE[Subscription / Allowance / Ads]
      NOTIFY[Notification Services]
      ROUTES --> AUTH
      ROUTES --> DOMAIN
      DOMAIN --> DECISION
      DOMAIN --> AI
      DOMAIN --> MONETIZE
      DOMAIN --> NOTIFY
    end

    subgraph Infra[State + Infrastructure]
      PG[(PostgreSQL)]
      REDIS[(Redis)]
      CACHE[Vision / Request Cache]
    end

    RN -->|JSON / Multipart / JWT| ROUTES
    DOMAIN --> PG
    AI --> CACHE
    AI -->|OpenAI-compatible provider| MODEL[LLM / Vision Model]
    AI -->|provider failure| FALLBACK[Deterministic Heuristic LLM]
    CACHE --> REDIS
    NOTIFY --> PUSH[OneSignal]
    MONETIZE --> RC[RevenueCat]
```

```text
.
├── apps/
│   ├── mobile/                  # Expo / React Native client
│   └── backend/                 # Fastify API + domain services
├── packages/
│   ├── shared-types/            # Zod-backed API/domain contracts
│   ├── ai-pipeline/             # Standalone AI pipeline package
│   └── ui-components/           # Shared UI components
├── assets/                      # Product / mascot / cuisine assets
├── docs/                        # Legal, product & design specs, PAYWALL.md
├── .github/workflows/           # CI
├── docker-compose.yml           # PostgreSQL + Redis + backend
├── railway.toml                 # Railway deployment configuration
├── turbo.json                   # Monorepo task graph
└── package.json                 # Workspace scripts and engine requirements
```

<details>
<summary><b>Mobile navigation and state</b></summary>

```text
RootStack
├── Tabs
│   ├── Rescue
│   ├── Kitchen
│   ├── Meal Plan
│   └── Profile
├── Onboarding
├── Paywall
├── Taste Journal
└── Common Table
```

React Query holds long-lived server state; eight Zustand stores hold local interaction state:

| Store | Role |
|---|---|
| `auth.store` | JWT + user profile |
| `monetization.store` | Free/Pro tier and credits |
| `decision.store` | Ephemeral rescue intent / reality / craving |
| `meal-memory.store` | Planning state and intents |
| `rescues.store` | Recent rescue history |
| `notifications.store` | Notification inbox |
| `settings.store` | Kitchen-import privacy setting |
| `common-table.store` | Household / shared-meal state |

</details>

<details>
<summary><b>API surface (98 endpoints across 23 route modules and <code>GET /health</code>)</b></summary>

Swagger/OpenAPI is served at `/docs`. The shared contract is `packages/shared-types/src/index.ts`.

| Domain | Scope |
|---|---|
| Auth | Registration, login, Google auth, verification, onboarding |
| Meal | Meal analysis and meal data |
| Rescue | Analyze, generate, decide, feedback, satisfaction, aftercare |
| AI Rescue | Conversational rescue generation and negotiation |
| Decision | Intent / reality / decision support |
| Kitchen | Dashboard, capture, identify, inventory intelligence |
| Pantry | Inventory CRUD + used-state transitions |
| Taste Journal | Patterns, insights, discoveries, boundaries, overrides |
| User / Taste | Taste profile and personalization |
| Household | Members and shared state |
| Common Table | Shared-meal convergence and lifecycle |
| Meal Memory | Intent, plans, rules, feedback, memory events |
| Subscription | Subscription and entitlement state |
| Ads | Eligibility, rewards, sync |
| Notifications | Inbox / snooze interactions |
| Webhook | RevenueCat and provider webhooks |

**Two paths.** The main Rescue pipeline enforces constraints in code before ranking. The conversational AI Rescue route (`POST /api/v1/ai-rescue/generate`) takes a lighter-weight route: time and cooking limits are injected into the model prompt as text ([`ai-rescue.service.ts:89-91`](./apps/backend/src/services/ai-rescue.service.ts)) so the same limits travel with the request, and the result is persisted with its conversation metadata ([`ai-rescue.routes.ts:138-139`](./apps/backend/src/routes/ai-rescue.routes.ts)).

</details>

<details>
<summary><b>Data model (32 definitions)</b></summary>

- **Core:** `User`, `Meal`, `Rescue`, `Feedback`, `Preference`, `Pantry`
- **Taste V2:** `TasteMemory`, `TasteEvent`, `TasteExposure`, `TasteCombination`, `TasteSensoryPreference`, `TasteTreatmentPreference`
- **Taste Journal:** `TasteSignal`, `TasteSignalEvidence`, `TasteInsightOverride`, `TasteJournalMeta`, `UserTastePreferences`
- **Decision / satisfaction:** `AdditionEvent`, `SatisfactionRecord`, `DecisionEvent`
- **Household:** `Household`, `HouseholdMember`, `HouseholdPreference`, `SharedMeal`, `SharedMealMember`, `TableOutcome`, `TableEvent`
- **Meal Memory:** `MealMemoryEvent`, `MealPlan`, `MealEvent`, `MealRule`, `InventoryReservation`

Schema management is Sequelize `sync({ alter: true })` — a development strategy, not a production migration system.

</details>

---

## Beyond Rescue

<details>
<summary><b>Personalization — evidence, not a single "taste score"</b></summary>

Taste memory is **context-scoped** (cuisine, meal time, meal pattern, intervention pattern), so a preference seen in one context does not silently become global. Confidence is tracked as **unknown → inferred → confirmed**, so a cold-start guess and explicit feedback are not treated as equally authoritative. Recency penalties provide **anti-fatigue**.

The meal-completion service updates an affinity with a count-decayed learning rate:

```text
newAffinity = oldAffinity × (1 − w) + evidence × w
w           = evidenceWeight / (1 + oldCount × 0.35)
```

The result is clamped to `[-1, +1]` and rounded to two decimals. Early evidence moves the estimate quickly; later evidence refines it. The trade-off is slower adaptation when someone's tastes genuinely change.

**`w` is provably bounded.** `weightedPosterior` computes `w = evidenceWeight / (1 + oldCount × 0.35)`, and its only call site passes the constant `COLD_START_EVIDENCE_WEIGHT = 0.6` ([`meal-completion.service.ts:261-265`](./apps/backend/src/services/meal-completion.service.ts)). Since `oldCount ≥ 0`, the denominator is always ≥ 1, so `0 < w ≤ 0.6` and `(1 − w) ≥ 0.4` — the term cannot flip sign. The output is additionally clamped to `[-1, +1]`, so no further guarding is required.

</details>

<details>
<summary><b>Meal Memory — planning</b></summary>

Conversational planning intents, deterministic slot ranking, plan generation and refinement, meal rules, event memory, inventory reservation, autosave, and post-meal feedback. Candidates are evaluated against slots, household context, expiring ingredients, leftovers, diversity, recency, and convenience **before** plan state is written. LLM assistance can improve a plan; it is never the source of truth for persisted planning state.

</details>

<details>
<summary><b>Kitchen intelligence</b></summary>

Pantry items, leftovers, expiry tracking, item states (fresh / opened / leftover / use soon / gone), "What can I make?" retrieval, relative-date parsing ("tomorrow", "in 3 days"), and camera capture with AI identification. As with meal capture, **AI proposes; the user confirms** before anything becomes inventory.

</details>

<details>
<summary><b>Common Table — one household, several preferences</b></summary>

```text
Household preferences
       │
       ▼
Remove options unsafe for any member
       │
       ▼
Find shared cooking structure
       │
       ▼
Choose latest viable split point
       │
       ├──────────── Shared base ────────────┐
       ▼                                     ▼
Member A finish                         Member B finish
```

The split point is derived from the cooking graph, not hard-coded per meal. When genuine convergence cannot be produced, the system returns an honest fallback rather than fabricating a "one meal for everyone" result.

</details>

<details>
<summary><b>Notifications</b></summary>

OneSignal push, quiet hours (default 22:00–08:00), duplicate suppression, snooze for expiry alerts, an in-app inbox, scheduler support, and dry-run behaviour when provider credentials are absent. The expiry alert looks ahead 48 hours and avoids nudging about the same inventory state repeatedly.

</details>

---

## Safety, privacy, and responsible AI

- **Not medical or dietary advice.** Meal Rescue suggests changes to meals. It does not diagnose, treat, or replace guidance from a clinician or dietitian.
- **Allergies are enforced as code and fail closed.** Even so, ingredient detection from a photo is probabilistic; anyone with a serious allergy should verify ingredients and labels themselves.
- **The user confirms what the model saw.** Photo and kitchen detections go through an editable review step before they become structured state.
- **The model cannot override constraints.** Invented IDs are dropped, malformed output is rejected, and a deterministic fallback exists.
- **Every AI result carries provenance** (provider, model, prompt, pipeline, ranking version, fallback flag, timing, validation outcome).
- **Secrets stay out of the repo.** Real credentials are never committed; `EXPO_PUBLIC_*` variables are client-visible and must never hold server secrets.
- **User control over learned taste:** the Taste Journal lets users dismiss, correct, or forget insights.

**What is stored.** Account credentials, preferences and allergy/dietary constraints, household-member records (name, age group, allergies, notes), pantry and meal-plan state, taste signals and insights, and a record of which meals were analyzed. **Meal photos are never stored** — there is no image or `BLOB` column in any of the 36 models; images are transmitted to the AI provider in memory as data URIs for a single analysis, and only a SHA-256 hash of the image is kept as a Redis cache key for 24 hours (`CACHE_TTL_SECONDS = 86_400`, [`vision.service.ts:34,47`](./apps/backend/src/services/ai/vision.service.ts)).

**Deletion and export.** `DELETE /api/v1/user/account` ([`user.routes.ts:111`](./apps/backend/src/routes/user.routes.ts)) performs a full cascade: best-effort RevenueCat subscriber deletion, best-effort OneSignal user deletion, then destroys every model row carrying the user id and finally the user record. Full retention detail lives in Privacy Policy §5 (*Storage, Retention, and Security*), maintained outside this repository and deliberately not duplicated here.

---

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build

# Backend only
npm run test --workspace @meal-rescue/backend
npm run test:coverage --workspace @meal-rescue/backend
```

CI runs lint, typecheck, backend tests (with a PostgreSQL 15 service), the backend build, and Expo Doctor for the mobile workspace. At the submission snapshot the backend has **72 test files**, 22 of them database-backed.

Tests are organized around behavioural contracts:

- **AI safety and constraints** — a model cannot bypass hard constraints; invalid model output is contained.
- **Personalization** — cold start, feedback weighting, anti-fatigue, context-scoped memory.
- **Household** — convergence, member-specific constraints, late branching, honest fallback.
- **Monetization** — allowance state, rewarded-ad idempotency, subscription transitions, Pro/free gating, webhooks.
- **Security and isolation** — authorization boundaries and cross-user isolation.

CI does **not** perform a full native Android/iOS release build; store packaging is verified separately.

---

## Engineering decisions

1. **Shared contracts before duplicated DTOs.** `packages/shared-types` (Zod) is the mobile/backend boundary, so malformed data is observable instead of silently accepted.
2. **Domain services never own provider configuration.** Provider and model selection live at the composition root, which keeps services testable with deterministic implementations.
3. **Deterministic code owns hard constraints.** Safety- and business-critical rules need to be executable and testable, not optimistically prompted.
4. **User confirmation before state creation.** AI detections are reviewable before they persist.
5. **Provenance is part of the result.** Model, prompt, pipeline, and fallback metadata are application data, not debug logging.
6. **Graceful degradation is a feature.** A provider outage degrades the ranking, not the product.
7. **The backend owns monetization state.** Allowances, credits, and tier confirmation are never trusted from the client.

---

## Repository proof map

Suggested reading order for a quick technical review:

| # | Claim | Where to inspect |
|---|---|---|
| 1 | Shared API/domain contract | `packages/shared-types/src/index.ts` |
| 2 | Service composition / dependency wiring | `apps/backend/src/services/composition.ts` |
| 3 | Rescue pipeline | `apps/backend/src/services/rescue-pipeline.service.ts` |
| 4 | LLM abstraction, fallback, vision, prompts | `apps/backend/src/services/ai/` (`openai-llm-client.ts`, `heuristic-llm-client.ts`, `llm-factory.ts`, `resilient-llm-client.ts`, `vision.service.ts`, `prompts.ts`) |
| 5 | Decision / constraint pipeline | `apps/backend/src/services/v2/` |
| 6 | Taste learning | `apps/backend/src/services/meal-completion.service.ts`, `taste-*`, `taste-journal/` |
| 7 | Household convergence | `apps/backend/src/services/common-table/` |
| 8 | Planning | `apps/backend/src/services/meal-memory/` |
| 9 | Allowance / monetization | `apps/backend/src/services/rescue-allowance.service.ts`, `apps/backend/src/routes/subscription.routes.ts` |
| 10 | Fastify application | `apps/backend/src/app.ts` |
| 11 | Tests | `apps/backend/tests/` |
| 12 | Mobile navigation and screens | `apps/mobile/src/navigation/AppNavigator.tsx`, `apps/mobile/src/screens/` |
| 13 | CI · local infra · deployment | `.github/workflows/ci.yml` · `docker-compose.yml` · `railway.toml` |

---

## Environment reference

<details>
<summary><b>Backend variables</b></summary>

| Variable | Purpose |
|---|---|
| `PORT` | Backend listen port |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `JWT_SECRET` | Authentication signing secret |
| `OPENAI_API_KEY` | Primary model-provider credential |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible API base URL |
| `OPENAI_TEXT_MODEL` | Text model identifier (default `gpt-4o-mini`) |
| `OPENAI_VISION_MODEL` | Vision model identifier for the OpenAI-compatible path (default `gpt-4o-mini`) |
| `OPENROUTER_VISION_API_KEY` | Optional dedicated vision-provider credential |
| `OPENROUTER_VISION_MODEL` | Dedicated vision model (default `qwen/qwen3-vl-32b-instruct`) |
| `AI_REQUEST_TIMEOUT_MS` | AI request timeout |
| `AI_MAX_RETRIES` | Application retry limit |
| `LLM_MAX_TOKENS` | Response token budget |
| `AD_REWARD_CREDITS` | Rewarded-ad Rescue Fuel grant (default 2) |
| `PRO_PASS_MINUTES` | Temporary Pro Pass duration (default 60) |
| `REVENUECAT_WEBHOOK_SECRET` | Subscription webhook verification |
| `ONESIGNAL_REST_API_KEY` | Push provider credential |
| `ONESIGNAL_APP_ID` | Push app identifier |

Model names are configuration defaults, not a claim that they are the only supported models. Do not copy example values into source code.

</details>

<details>
<summary><b>Mobile variables</b></summary>

Client-exposed `EXPO_PUBLIC_*` values only — never server secrets.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend address (see [Mobile app](#mobile-app)) |
| `EXPO_PUBLIC_ONESIGNAL_APP_ID` | Push (optional) |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` / `EXPO_PUBLIC_ADMOB_IOS_APP_ID` | Required for native builds |
| RevenueCat keys | Variable names are listed in `apps/mobile/.env.example` |

</details>

---

## Contributing

Understand which layer owns a behaviour before changing it:

```text
Shared contract → Route → Domain service → Deterministic rules / AI abstraction
   → Persistence → Mobile API client + screen/store → Tests
```

When behaviour changes, update the tests and the shared contract rather than patching the client around a backend mismatch.

### How this was built

AI coding assistants did the drafting — prose, scaffolding, boilerplate. **Every design decision was taken, challenged, and, where it did not hold up, redesigned by hand before it shipped.** The reasoning is not asserted in this paragraph; it is checked into [`docs/superpowers/`](./docs/superpowers/) as 16 dated plans and design specs following a plan-then-implement workflow (opencode + superpowers), so any change here can be traced back to the decision that produced it. Output was validated the ordinary way: **72 backend test files**, a PostgreSQL-backed CI pipeline, and lint/typecheck gates on every push.

Three **Shipaton 2025** winners shaped the product thinking. Each is named for what it actually won, and for the one thing taken from it — not as decoration, but because each changed a decision that is visible in this repository:

| Winner | Award | What it changed here |
|---|---|---|
| [Gurwi – Learn Anything](https://www.revenuecat.com/blog/company/shipaton-2025-winners) | 1st place, #BuildInPublic | That award is judged on sharing the development journey. It is why this README leads with the problem and a committed decision record instead of a feature list. |
| [SkillMe](https://www.revenuecat.com/blog/company/shipaton-2025-winners) | 2nd place, RevenueCat Design Award | Judged on visual craft. It pushed the paywall from a pricing table to a designed surface: one screen, three entrances — locked plan day, loved rescue, or last move — each with its own opener ([`PaywallScreen.tsx:116`](./apps/mobile/src/screens/PaywallScreen.tsx)). |
| [Dripped](https://www.revenuecat.com/blog/company/shipaton-2025-winners) | 2nd place, Best Vibes | Won for a PR-driven workflow where the human reviews rather than types. That is the model used here: the assistant drafts, engineering judgement decides, tests arbitrate. |


---

## License

Released under the [MIT License](./LICENSE). Copyright (c) 2026 Loujan.

Purchases and entitlements are powered by [RevenueCat](https://www.revenuecat.com/).

<div align="center">
  <sub><b>A better meal does not always require a new meal.</b></sub>
</div>