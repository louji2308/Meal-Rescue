<div align="center">
  <img src="assets/Logo.png" alt="Meal Rescue logo" width="180" />

  # Meal Rescue

  ### The smallest change that makes a meal better.

  **An AI meal-optimization system that starts with the food you already have, finds one practical improvement, and learns from what happens next.**

  <p>
    <a href="https://www.shipaton.com/">Shipaton 2026</a> · Expo · React Native · Fastify · PostgreSQL · Redis · TypeScript
  </p>
</div>

---

## Judge Fast Lane

Meal Rescue is not a recipe generator. It is a **minimum-intervention decision system** for the meal that is already in front of you.

| In 30 seconds | What to look for |
|---|---|
| **The problem** | People often need a better meal, not an entirely different meal. |
| **The interaction** | Show us the meal by **photo, text, or voice**. Then describe what is realistic right now. |
| **The decision engine** | Generate bounded candidates → enforce hard constraints → rank and explain the viable options → return **one best move + alternatives**. |
| **The learning loop** | Capture the decision and satisfaction outcome → update context-scoped taste memory → use that evidence on future rescues. |
| **The engineering thesis** | **LLMs rank and explain; deterministic code owns safety, feasibility, validation, and fallback behaviour.** |

> **Core idea:** the smallest useful intervention usually beats a full meal reset.

## Built for Fast Technical Review

Shipaton’s published judging process says prescreeners read the project submission and watch the first two minutes of the demo, while judges read the full description, review screenshots, and may download the app. The 2025 Grand Prize criteria also emphasized **innovation, execution, feasibility, and integration**. This README is organized around those same review questions: what is novel, where the implementation lives, how the system works, how it runs, and how the integrations are used.

**Official reviewer guidance:** [How we judge Shipaton](https://www.shipaton.com/blog/how-we-judge-shipaton) · [How to win Shipaton: pitching](https://www.shipaton.com/blog/how-to-win-shipaton-part-4-pitching)

---

## Why This Repository Is Interesting

### 1. Minimum intervention, not maximum generation

The system is optimized around a constrained change to the current meal. A rescue can be an addition, substitution, modification, or an intentional **keep-as-is** decision. The output is deliberately small: one primary recommendation and a limited set of alternatives.

### 2. Deterministic-first AI

The model does not receive unrestricted authority over the final decision. The backend constructs a feasible solution space, applies hard constraints, asks the LLM to rank or explain that space, validates the result, and falls back deterministically when the model path is unavailable or invalid.

### 3. Personalization is evidence-backed

Taste is stored as context, not as a single global score. A preference can depend on cuisine, meal time, meal pattern, or intervention pattern. The system also tracks confidence and evidence so that a weak inference does not masquerade as a permanent preference.

### 4. The household problem is solved as a convergence problem

Common Table does not try to invent a fictional “perfect meal” for everyone. It finds a shared base, determines where preferences can split, and pushes personalization as late as possible in the cooking graph.

### 5. This is a real product surface, not a model demo

The repository includes authentication, structured APIs, PostgreSQL persistence, Redis caching, rate limiting, subscription state, rewarded-ad credits, push notification infrastructure, household workflows, meal planning, telemetry/provenance, and a substantial automated backend test suite.

---

## Product Loop

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

The same architecture extends into Kitchen intelligence, Meal Plan, and Common Table rather than treating each feature as an isolated AI call.

---

# Architecture

## Repository Topology

Meal Rescue is a Turborepo + npm-workspaces monorepo with two applications and three shared packages.

```text
.
├── apps/
│   ├── mobile/                  # Expo / React Native client
│   └── backend/                 # Fastify API + domain services
├── packages/
│   ├── shared-types/            # Zod-backed API/domain contracts
│   ├── design-tokens/           # Shared visual tokens
│   └── eslint-config/            # Shared lint configuration
├── assets/                      # Product / mascot / cuisine assets
├── docs/                        # Documentation namespaces (currently skeletal)
├── .github/workflows/           # CI
├── docker-compose.yml           # PostgreSQL + Redis + backend
├── railway.toml                 # Railway deployment configuration
├── turbo.json                   # Monorepo task graph
└── package.json                 # Workspace scripts and engine requirements
```

## System Architecture

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
      ROUTES[20 Route Modules]
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

---

# The Rescue Engine

The Rescue engine is the technical heart of the project.

## End-to-End Decision Pipeline

```text
Meal signal
   │
   ├─ photo → vision analysis → normalized detected items
   ├─ text  → ingredient / meal interpretation
   └─ voice → speech recognition → text path
                │
                ▼
      Intent + reality + craving
                │
                ▼
      Candidate generation
                │
                ▼
      HARD deterministic constraints
                │
                ▼
      LLM ranking + explanation
                │
                ▼
      Schema / identity / safety validation
                │
                ▼
       One best move + alternatives
                │
                ▼
       Decision + satisfaction event
                │
                ▼
        Personalization update
```

The implementation separates **generation**, **constraint enforcement**, **ranking**, **presentation**, and **learning** so that a provider failure does not become a product failure.

## Step 1 — Capture

Meal Rescue accepts three input modes:

- **Photo:** mobile capture or gallery selection.
- **Text:** direct description of the meal.
- **Voice:** speech recognition with a graceful fallback to text input.

The photo path produces an editable review of detected items before the rescue request continues. This keeps the user in control of what the model believes is on the plate.

## Step 2 — Model Intent, Not Just Ingredients

The Rescue flow explicitly asks what the user wants from the current meal:

| Intent | Meaning |
|---|---|
| `SATISFY` | Protect a craving or desired sensory outcome |
| `PRESERVE` | Keep the meal recognizable while improving it |
| `LIGHTEN` | Move the meal toward something lighter |
| `DECIDE` | Help choose a practical direction |
| `NO_COOK` | Improve the meal without requiring cooking |

This is followed by the reality layer:

- available time: **5 / 15 / 30+ minutes**
- cooking ability: **cook a bit / no cooking**
- budget: **tight / medium / open**
- cleanup tolerance: **minimal / medium / no limits**
- additional hard constraints such as dietary restrictions, allergies, equipment, and ingredients to avoid

The craving step is optional, so the flow remains low-friction while still providing a guardrail against technically valid but emotionally wrong suggestions.

## Step 3 — Generate a Bounded Candidate Set

Candidates are structured as one of:

- `addition`
- `substitution`
- `modification`

The pipeline also supports a deliberate `keep_as_is` path. This matters because the system is allowed to conclude that **doing nothing is better than making a needless change**.

## Step 4 — Apply Hard Constraints Before Ranking

Hard constraints are enforced in deterministic code rather than delegated to the model.

Examples include:

- maximum preparation time
- budget ceiling
- whether cooking is allowed
- equipment requirements
- ingredients to avoid
- allergies
- dietary restrictions
- preservation of the original meal when required

The allergy and feasibility path is designed to fail closed when the available information is insufficient for a safe deterministic decision.

## Step 5 — Let the Model Rank, Not Invent

The LLM receives an already constrained candidate set and helps answer:

> “Among the options that are actually feasible, which one best satisfies the user’s intent and constraints, and how should it be explained?”

The ranking layer validates the returned candidate IDs. Unknown or invented IDs are dropped. Candidates omitted by the model can be restored with a neutral score so the final result remains grounded in the backend-generated solution space.

There is a deterministic ranking fallback when model ranking fails.

## Step 6 — Validate Before Presentation

The pipeline records structured AI provenance and validates the final response before it reaches the client.

Current provenance includes:

- provider
- model
- prompt version
- pipeline version
- ranking version
- whether fallback was used
- processing time
- validation outcome

That turns an opaque AI call into a traceable application event.

---

# AI Architecture

## Provider Abstraction

The composition root chooses the LLM implementation at startup. Product services do not import the provider SDK directly.

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

The OpenAI-compatible client is configurable through environment variables, so the model/provider can change without rewriting the domain layer.

## Resilient Provider Strategy

The current AI layer supports:

1. **Configurable provider/model selection** through environment variables.
2. **Structured JSON responses** validated with Zod schemas.
3. **Transport/application retry controls** for transient model failures.
4. **Deterministic heuristic fallback** when the network/model path is unavailable.
5. **Explicit fallback provenance** so degraded responses are distinguishable from model-backed responses.

The heuristic implementation is deliberately boring: it uses deterministic rules and local data instead of pretending to be an LLM.

## Vision Pipeline

Vision analysis has a separate path from ordinary text generation:

```text
Image bytes
   │
   ▼
SHA-256 fingerprint
   │
   ▼
Redis cache lookup
   │
   ├─ hit ───────────────► structured result
   │
   └─ miss
       │
       ▼
  Image optimization
       │
       ▼
 Vision model
       │
       ▼
 Zod validation
       │
       ▼
 24-hour contextual cache
```

The cache key is scoped by the image and contextual hints such as cuisine, and the kitchen scanning path uses its own namespace.

Current prompt identifiers are versioned rather than anonymous, including:

- `v3.0-food-recognizer`
- `v1.0-kitchen-analyzer`
- `v2.0-mr1`
- `v2.1-mr2`

This makes prompt changes observable alongside application versions.

## Current Model Configuration

The repository intentionally does not hard-code a single vendor as the product architecture.

The supplied backend environment template includes configurable values for:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini
OPENROUTER_VISION_API_KEY=
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

Use the environment file in your deployment rather than copying example values into source code. Model names in this README are configuration defaults from the repository, not a claim that they are the only supported models.

---

# Personalization Architecture

Meal Rescue treats personalization as an evidence problem rather than a single “taste score.”

## Context-Scoped Taste Memory

Taste memory can be scoped by context such as:

- cuisine
- meal time
- meal pattern
- intervention pattern

This prevents a preference observed in one context from silently becoming a global preference.

## Evidence Update

The current meal-completion service updates an affinity using a weighted posterior-style formula:

```text
newAffinity = oldAffinity × (1 - w) + evidence × w

w = evidenceWeight / (1 + oldCount × 0.35)
```

The resulting affinity is clamped to `[-1, +1]` and rounded to two decimal places.

The design creates a useful property: repeated evidence does matter, but repeated evidence does not make the memory explode toward certainty at an arbitrary rate.

## Confidence States

The preference layer distinguishes:

- **unknown**
- **inferred**
- **confirmed**

Cold-start signals and explicit user feedback are therefore not treated as equally authoritative.

## Anti-Fatigue

The cold-start logic also includes recency penalties so that repeated exposure can become less attractive over time instead of producing the same recommendation indefinitely.

---

# Meal Memory

Meal Memory turns the recommendation engine into a planning system.

It contains:

- conversational planning intents
- deterministic slot ranking
- plan generation and refinement
- meal rules
- event memory
- inventory reservation concepts
- autosave and plan persistence
- post-meal feedback

The planning engine is deterministic at the persistence boundary: candidates are evaluated against meal slots, household context, expiring ingredients, leftovers, diversity, recency, and convenience before plan state is written.

This is an important architectural distinction:

> **LLM assistance can improve the plan; it does not become the source of truth for persisted planning state.**

---

# Kitchen Intelligence

The Kitchen tab is not just CRUD.

It supports:

- pantry items
- leftovers
- expiry tracking
- item state such as fresh / opened / leftover / use soon / gone
- “What can I make?” style retrieval
- camera/photo capture for kitchen items
- AI identification with an editable review step
- manual capture
- relative date parsing such as “tomorrow” or “in 3 days”

The kitchen capture flow mirrors the meal capture philosophy: **AI proposes; the user confirms the structured data before it becomes inventory.**

---

# Common Table

Common Table addresses a different optimization problem: **one household, multiple preferences**.

The convergence engine is deterministic and currently follows a late-branching strategy:

```text
Household preferences
       │
       ▼
Remove unsafe options for any member
       │
       ▼
Find shared cooking structure
       │
       ▼
Choose latest viable split point
       │
       ├──────────── Shared base ────────────┐
       │                                     │
       ▼                                     ▼
Member A finish                         Member B finish
```

The split point is derived from the cooking graph rather than hard-coded for a particular meal. Supported convergence patterns include bowl, stir-fry, pasta, skillet, and platter structures.

When genuine convergence cannot be produced, the system returns an honest fallback rather than fabricating a “one meal for everyone” result.

---

# Product Surfaces

## Mobile navigation

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

The Rescue stack contains the core capture → intent → reality → craving → recommendation → feedback loop. The report generated from the repository identifies 14 screens in that HomeStack, while the full mobile source tree contains additional root, Kitchen, Common Table, and detail screens.

## Profile + Taste Journal

Profile surfaces subscription state, learned preferences, reminder settings, account actions, and confidence-backed insights.

Taste Journal turns those insights into a user-facing explanation of what the system thinks it has learned, including the ability to dismiss, correct, or forget insights.

## Monetization

The backend owns allowance state and credit-grant operations rather than trusting the client.

Current monetization infrastructure includes:

- Free tier allowance
- Pro subscription state
- RevenueCat synchronization and webhook handling
- rewarded-ad Rescue Fuel credits
- temporary Pro Pass state
- idempotent rewarded-ad transaction handling
- interstitial/rewarded ad integration on mobile

The repository environment defaults include **2 reward credits per eligible ad grant** and a **60-minute Pro Pass**.

---

# Notifications & Engagement

Notification infrastructure includes:

- OneSignal push delivery
- quiet hours
- duplicate suppression
- snooze behaviour for expiry alerts
- an in-app notification inbox
- scheduler support
- dry-run behaviour when provider credentials are not configured

The expiry-alert path looks ahead by **48 hours** and is designed to avoid repeatedly nudging the same user about the same inventory state.

Default quiet hours in the backend are **22:00–08:00**.

---

# State Management

The mobile client currently uses eight Zustand stores:

| Store | Role |
|---|---|
| `auth.store` | JWT + user profile |
| `monetization.store` | Free/Pro tier and credits |
| `decision.store` | Ephemeral rescue intent / reality / craving |
| `meal-memory.store` | Planning state and intents |
| `rescues.store` | Recent rescue history |
| `notifications.store` | Notification inbox |
| `settings.store` | Kitchen-import privacy setting |
| `common-table.store` | Household/shared-meal state |

React Query is used alongside Zustand for API-state management, keeping long-lived server state separate from local interaction state.

---

# API Surface

The backend exposes **83 application endpoints across 20 route modules**, plus the `/health` endpoint.

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
| User / Taste | Taste profile and personalization APIs |
| Household | Household members and shared state |
| Common Table | Shared-meal convergence and lifecycle |
| Meal Memory | Intent, plans, rules, feedback, memory events |
| Subscription | Subscription and entitlement state |
| Ads | Eligibility, rewards, sync |
| Notifications | Inbox/snooze interactions |
| Webhook | RevenueCat and provider webhook handling |

### API documentation

When the backend is running, Swagger/OpenAPI is served at:

```text
/docs
```

The application also exposes:

```text
GET /health
```

The shared contract package is the primary cross-client API/type boundary:

```text
packages/shared-types/src/index.ts
```

---

# Data Model

The repository currently contains **35 domain model definitions** spanning:

### Core product state

`User`, `Meal`, `Rescue`, `Feedback`, `Preference`, `Pantry`

### Taste V2

`TasteMemory`, `TasteEvent`, `TasteExposure`, `TasteCombination`, `TasteSensoryPreference`, `TasteTreatmentPreference`

### Taste Journal

`TasteSignal`, `TasteSignalEvidence`, `TasteInsightOverride`, `TasteJournalMeta`, `UserTastePreferences`

### Decision / satisfaction

`AdditionEvent`, `SatisfactionRecord`, `DecisionEvent`

### Household

`Household`, `HouseholdMember`, `HouseholdPreference`, `SharedMeal`, `SharedMealMember`, `TableOutcome`, `TableEvent`

### Meal Memory

`MealMemoryEvent`, `MealPlan`, `MealEvent`, `MealRule`, `InventoryReservation`

> **Schema note:** the current repository initializes Sequelize with `sync({ alter: true })`. A dedicated migration runner is not present in this snapshot. Treat the existing startup sync as the current development schema-management strategy, not as a production migration system.

---

# Reliability & Security

The Fastify bootstrap configures the application with several production-oriented controls:

- CORS
- Helmet
- JWT authentication
- global rate limiting
- multipart upload limits
- structured route/service boundaries
- Swagger/OpenAPI exposure for discoverability
- Redis integration
- graceful shutdown
- request-level testability through `fastify.inject()`

The codebase also includes tests covering areas such as:

- authorization and cross-user isolation
- authentication and security behaviour
- AI constraint enforcement
- candidate ranking validation
- fallback behaviour
- monetization and ad idempotency
- notifications / snooze / expiry flows
- taste memory and cold-start learning
- household convergence
- meal memory
- webhook handling

The current source tree contains **65 backend test files**. Those files are evidence of intended behaviour; this README does **not** claim that every test/build command was re-run as part of documentation generation.

---

# Why the AI Architecture Is Deliberately Boring

A useful product should degrade gracefully.

Meal Rescue therefore avoids a design where:

```text
LLM output = application truth
```

Instead, the intended trust hierarchy is:

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

This is useful for three reasons:

1. **Safety:** hard constraints are executable and testable.
2. **Reliability:** provider outages can fall back without taking the whole feature down.
3. **Debuggability:** decisions can be traced to candidate generation, ranking, validation, prompt version, and fallback state.

---

# Repository Proof Map

A technical judge should be able to move from a claim in this README to the implementation quickly.

| Claim | Where to inspect |
|---|---|
| Fastify application composition | `apps/backend/src/app.ts` |
| Service composition / dependency wiring | `apps/backend/src/services/composition.ts` |
| LLM abstraction | `apps/backend/src/services/ai/` |
| OpenAI-compatible client | `apps/backend/src/services/ai/openai-llm-client.ts` |
| Deterministic fallback | `apps/backend/src/services/ai/heuristic-llm-client.ts` |
| Resilient provider selection | `apps/backend/src/services/ai/llm-factory.ts` / `resilient-llm-client.ts` |
| Vision caching + validation | `apps/backend/src/services/ai/vision.service.ts` |
| Prompt versioning | `apps/backend/src/services/ai/prompts.ts` |
| Rescue pipeline | `apps/backend/src/services/rescue-pipeline.service.ts` |
| Decision / constraint pipeline | `apps/backend/src/services/v2/` |
| Taste learning | `apps/backend/src/services/meal-completion.service.ts`, `apps/backend/src/services/taste-*`, and `taste-journal/` |
| Planning | `apps/backend/src/services/meal-memory/` |
| Household convergence | `apps/backend/src/services/common-table/` |
| Allowance / monetization | `apps/backend/src/services/rescue-allowance.service.ts` and `apps/backend/src/routes/subscription.routes.ts` |
| Shared contract | `packages/shared-types/src/index.ts` |
| Mobile navigation | `apps/mobile/src/navigation/AppNavigator.tsx` |
| Mobile feature surfaces | `apps/mobile/src/screens/` |
| CI | `.github/workflows/ci.yml` |
| Local infrastructure | `docker-compose.yml` |
| Deployment | `railway.toml` |

---

# Developer Quickstart

## Prerequisites

Recommended versions for the current repository:

- Node.js **20+**
- npm **11.6.2** (the repository declares this package-manager version)
- Docker Desktop / Docker Engine with Compose
- PostgreSQL 15 and Redis 7 if you run infrastructure outside Docker
- Expo tooling compatible with the project’s Expo SDK

## 1. Install workspace dependencies

```bash
npm ci
```

## 2. Configure the backend

```bash
cp apps/backend/.env.example apps/backend/.env
```

PowerShell:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
```

Set at minimum:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meal_rescue
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-this-in-development
```

For model-backed AI, configure the relevant API key/model variables as well.

> Never commit real credentials. The mobile `EXPO_PUBLIC_*` variables are client-exposed configuration and must never contain server secrets.

## 3. Start PostgreSQL, Redis, and the API

The repository includes a Compose setup for:

- PostgreSQL 15
- Redis 7
- Fastify backend

Run:

```bash
docker compose up -d
```

The Compose backend is exposed on:

```text
http://localhost:3010
```

Swagger:

```text
http://localhost:3010/docs
```

Health:

```text
http://localhost:3010/health
```

## 4. Configure the mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

PowerShell:

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

For an Android emulator, the supplied example uses:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3010
```

For an iOS simulator, use the host machine address appropriate to your environment (commonly `http://localhost:3010`).

## 5. Start Expo

```bash
npm run dev --workspace @meal-rescue/mobile
```

Then open the app in Expo Go or the configured emulator/device workflow.

---

# Running the Backend Directly

The backend defaults to the port declared in `apps/backend/.env.example`:

```env
PORT=3000
```

When running it directly, make sure your local `PORT` matches the address configured in the mobile client.

```bash
npm run dev --workspace @meal-rescue/backend
```

The Docker setup intentionally exposes the backend on port **3010**, so the Docker and direct-local workflows use different default ports.

---

# Verification Commands

From the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Targeted backend commands:

```bash
npm run test --workspace @meal-rescue/backend
npm run test:e2e --workspace @meal-rescue/backend
```

The repository’s CI workflow currently runs:

1. lint
2. typecheck
3. backend tests with a PostgreSQL 15 service
4. backend build
5. Expo Doctor for the mobile workspace

The CI workflow does **not** constitute a full native Android/iOS release build. Store packaging and release operations should therefore be verified separately before submission.

---

# Environment Reference

The repository ships example environment files so that deployment configuration is explicit.

| Variable | Purpose |
|---|---|
| `PORT` | Backend listen port |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `JWT_SECRET` | Authentication signing secret |
| `OPENAI_API_KEY` | Primary model-provider credential |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible API base URL |
| `OPENAI_TEXT_MODEL` | Text model identifier |
| `OPENAI_VISION_MODEL` | Vision model identifier for the OpenAI-compatible path |
| `OPENROUTER_VISION_API_KEY` | Optional dedicated vision-provider credential |
| `OPENROUTER_VISION_MODEL` | Dedicated vision model identifier |
| `AI_REQUEST_TIMEOUT_MS` | AI request timeout |
| `AI_MAX_RETRIES` | Application retry limit |
| `LLM_MAX_TOKENS` | Response token budget |
| `AD_REWARD_CREDITS` | Rewarded-ad Rescue Fuel grant |
| `PRO_PASS_MINUTES` | Temporary Pro Pass duration |
| `REVENUECAT_WEBHOOK_SECRET` | Subscription webhook verification |
| `ONESIGNAL_REST_API_KEY` | Push provider credential |
| `ONESIGNAL_APP_ID` | Push app identifier |

Mobile-only configuration is kept under `EXPO_PUBLIC_*` and SDK/provider keys required by the installed integrations.

---

# Testing Philosophy

Meal Rescue’s tests are organized around **behavioural contracts**, not only route snapshots.

The highest-value areas to inspect are:

### AI safety and constraint tests

These verify that a model cannot bypass hard business constraints and that invalid model output is contained.

### Personalization tests

These cover cold-start signals, feedback weighting, recency/anti-fatigue behaviour, and context-scoped taste memory.

### Household tests

These exercise the convergence engine, member-specific constraints, late branching, and honest fallback behaviour.

### Monetization tests

These include allowance state, rewarded-ad idempotency, subscription transitions, and Pro/free gating.

### Security and isolation tests

These focus on authorization boundaries and preventing one user from accessing another user’s data.

---

# Engineering Decisions

## Decision 1 — Shared contracts before duplicated DTOs

The `packages/shared-types` package is the contract boundary between mobile and backend. Zod-backed schemas make malformed data observable rather than silently accepted.

## Decision 2 — Domain services do not own provider configuration

Provider/model selection lives at the composition boundary. This reduces coupling and makes testing with deterministic implementations possible.

## Decision 3 — Deterministic code owns hard constraints

Safety-critical or business-critical constraints need executable rules, not optimistic prompting.

## Decision 4 — User confirmation before state creation

AI-produced meal/kitchen detections are reviewable before they become structured state.

## Decision 5 — Provenance is part of the result

Model/provider/prompt/pipeline/fallback metadata is treated as application data rather than debug-only logging.

## Decision 6 — Graceful degradation is a feature

The heuristic implementation is intentionally available without network access, while the resilient client can fall back per request.

---

# Current Implementation Notes

This repository is substantial, but the following limitations are intentionally documented rather than hidden:

- **Database migrations:** the current code uses Sequelize `sync({ alter: true })`; a dedicated migration runner is not present in this snapshot.
- **Mobile CI:** CI runs Expo Doctor rather than a full native release build.
- **Release links:** store listing, demo-video, and Devpost submission URLs are not encoded in the repository snapshot and are therefore not guessed here.
- **Documentation namespaces:** `docs/api`, `docs/product`, and `docs/technical` currently contain placeholder files rather than a full separate documentation site.
- **Test/build status:** this README documents the repository and its test inventory; it does not claim that every command has passed in this documentation run.

These are explicit boundaries of the current repository, not omissions disguised as features.

---

# Recommended Reading Order for Technical Judges

A judge who wants to understand the implementation quickly can inspect the repository in this order:

```text
1. packages/shared-types/src/index.ts
2. apps/backend/src/services/composition.ts
3. apps/backend/src/services/rescue-pipeline.service.ts
4. apps/backend/src/services/ai/
5. apps/backend/src/services/decision/
6. apps/backend/src/services/meal-completion.service.ts
7. apps/backend/src/services/common-table/
8. apps/backend/tests/
9. apps/mobile/src/navigation/
10. apps/mobile/src/screens/
```

That path follows the actual architecture: **contracts → composition → product decision → AI boundary → deterministic safety → learning → household convergence → proof → client UX**.

---

# Contributing

Before opening a change, understand which layer owns the behaviour.

A typical feature should follow the repository’s boundaries:

```text
Shared contract
      ↓
Route / controller
      ↓
Domain service
      ↓
Deterministic rules / AI abstraction
      ↓
Persistence
      ↓
Mobile API client + screen/store
      ↓
Tests
```

When a behaviour changes, update the corresponding tests and shared contract rather than patching the client around a backend mismatch.

---

# License & Repository Status

This project is released under the [MIT License](./LICENSE). Copyright (c) 2026 Loujan. You are free to use, modify, and distribute the code, provided the license and copyright notice are preserved.

---

## Built Around One Principle

> **A better meal does not always require a new meal.**

Meal Rescue turns that idea into a full product loop:

**see the meal → understand intent → model reality → generate a small set of feasible changes → rank the best move → let the user decide → learn from the outcome.**

<div align="center">
  <sub>Meal Rescue · AI meal optimization · deterministic-first decision infrastructure</sub>
</div>
