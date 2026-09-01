# Meal Rescue 🍽️

**The Minimum Intervention Engine** — AI-powered meal optimization that suggests the *smallest change* that makes a meal better. Not a recipe dump.

> Snap a photo of any meal → AI identifies what's on the plate → the engine suggests one practical improvement (add protein, swap an ingredient) that fits your time, budget, and preferences — and learns what you actually like with every decision.

Built for **Shipaton 2026**. One repo, two apps, a deterministic-first AI pipeline, and a learning system that turns every "yes" and "no" into a better next rescue.

---

## Table of Contents

- [The Core Idea](#the-core-idea)
- [Features](#features)
- [How It Works — The Rescue Loop](#how-it-works--the-rescue-loop)
- [Architecture](#architecture)
- [Deterministic-First AI Pipeline](#deterministic-first-ai-pipeline)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Backend API](#backend-api)
- [Personalization & Learning](#personalization--learning)
- [Startup Guide](#startup-guide)
- [Configuration](#configuration)
- [Testing & CI](#testing--ci)
- [Engineering Principles](#engineering-principles)
- [Development Status](#development-status)
- [Contributing](#contributing)

---

## The Core Idea

Most meal apps answer "what should I cook?" with a wall of recipes you'll never follow. Meal Rescue answers a different question:

> **What's the one thing that would make this meal I'm already eating noticeably better — without turning my day upside down?**

The engine never recommends a full rebuild of your plate. It finds a single **Minimum Intervention** — add a protein, swap a refined carb, fold in a vegetable, tweak the cooking technique — constrained by *your* time, budget, equipment, allergies, and taste. Every suggestion is framed by plain-language reasoning ("why this?"), and every outcome feeds back into a **Taste Memory Bank** so the next rescue is more personal than the last.

---

## Features

### Core experience
- **Multi-modal capture** — snap a photo 📸, type a description, or speak it 🎙️
- **AI meal understanding** — detects foods, ingredients, and nutritional components with confidence scores and uncertainty flags
- **One recommendation, up to two alternatives** — never a list dump
- **Exactly four actions** — `rescue`, `swap`, `dont_have`, `keep_as_is` — each wired to real behavior (swapping re-runs the funnel; `dont_have` reranks around the missing ingredient)
- **Satisfaction feedback** — Better / Same / Not for me, in three taps

### Personalization & learning
- **Taste Memory Bank** — per-context learned tastes (cuisine, meal time, meal pattern, ingredient × meal group). Context-scoped, never a blanket per-ingredient score
- **Meal-Completion Onboarding** — an adaptive A/B pairing game that learns your latent addition preferences (balance, crunch, satisfaction, effort, exploration) through weighted-posterior inference before your first real rescue
- **Culinary Compass** — culture-aware recommendations across 8 culinary families, with a learned tradition↔modern axis
- **Taste Journal** — a living story of your food personality: learned entries, personality shifts, milestones, corrections, and cultural evolution
- **Feedback-driven preference learning** — confidence-weighted preference signals that grow with consistent signals and decay on contradiction
- **Cold-start ranking signals** — anti-fatigue and diversity guardrails so the engine explores before it exploits

### Deeper tools
- **Fridge Negotiator** 🧊 — "what can I make from what I already have?" using your pantry + a time budget
- **Leftover Alchemist** ✨ — transform leftovers into bowls, wraps, soups, and skillets, ranked by effort
- **Smart Pantry** 🥫 — expiry tracking ("expires in N days"), low-stock badges, suggested uses that surface expiring/low-stock items with one-line rescue previews

### Monetization & engagement
- **Free tier**: 3 server-authoritative rescues / day
- **Meal Rescue Pro** — unlimited rescues via RevenueCat subscriptions (in-app purchase + server webhook, timing-safe)
- **Rescue Fuel** 🚀 — watch a rewarded ad, earn +2 rescues (idempotent, replay-proof grant ledger, max 2 rewarded ads/day)
- **Pro Pass** — a 1-hour temporary Pro upgrade earned via rewarded ad
- **Rescue Windows** ⏰ — push notifications timed to *your* learned mealtime (median-of-last-meals, cron scheduler, quiet-hour and snooze aware)
- **Spoiler Alert** 🔔 — nudges before pantry items expire
- **Staples Shelf** — sponsored ingredient strip for free-tier users

### Craft
- Animated **PlateDiffReveal** — your plate dims and the one addition drops in with spring physics
- **Scraps the Cat** 🐱 — a vector mascot with idle / scanning / celebrate moods
- Day-phase-aware living palette, confetti reward moments, haptic feedback, and press physics throughout
- Scannling loader, structured error banners with suggested actions, and full accessibility foundations

---

## How It Works — The Rescue Loop

```
        ┌─────────────┐
        │  Capture     │   photo · text · voice
        └──────┬──────┘
        ┌──────▼──────┐
        │  Review      │   AI extraction, confirm + constrain
        └──────┬──────┘      (5-min / no-cook / cheap / allergies)
        ┌──────▼──────┐
        │  Generator   │   constraint-filtered candidates (deterministic)
        └──────┬──────┘
        ┌──────▼──────┐
        │  Ranking     │   LLM ranks + explains (never decides alone)
        └──────┬──────┘
        ┌──────▼──────┐
        │  Pose        │   ONE recommendation + up to 2 alternatives
        └──────┬──────┘
        ┌──────▼──────┐
        │  Decide      │   rescue · swap · dont_have · keep_as_is
        └──────┬──────┘
        ┌──────▼──────┐
        │  Learn       │   feedback → Taste Memory → better next rescue
        └─────────────┘
```

Every step persists real data: the meal, the candidates, the recommendation, the user's decision, and the outcome. Rows in the `rescues` table are **first-class objects** — the system actually learns, it doesn't just log.

---

## Architecture

```
┌──────────────────────┐        ┌───────────────────────────────────────────┐
│   apps/mobile        │  HTTP  │   apps/backend  (Fastify 5)               │
│   Expo SDK 57 / RN   │◄──────►│                                          │
│   14 screens          │  JWT   │  routes ──► services ──► models          │
│   zustand + react-query│        │       │                     │            │
└──────────────────────┘        │       │              ┌──────▼───────┐   │
                                │       │              │  PostgreSQL  │   │
        ┌──────────────────┐    │       │              └──────────────┘   │
        │ shared-types     │    │    AI layer:                            │
        │ API contracts    │    │   OpenRouter (GLM-5.2) ─┐               │
        │ (package)        │    │   Heuristic fallback     ├─ LlmClient  │
        └──────────────────┘    │   Resilient wrapper     ┘               │
                                │   Redis (vision + rate-limit cache)     │
                                └───────────────────────────────────────────┘
```

- **Monorepo** orchestrated with **Turborepo** + npm workspaces
- **Composition root** (`composition.ts`) wires the whole service graph — services never touch provider SDKs or config directly
- **Contract-first**: every byte crossing the backend ↔ mobile boundary validates against `@meal-rescue/shared-types`

### Backend services (the intelligence)

| Service | Responsibility |
| --- | --- |
| `rescue-pipeline` | The core funnel — detect → generate → filter → rank → validate → persist |
| `vision` | Image → sha256 → cache → resize → LLM → zod-validated structured JSON (24h cache) |
| `llm-factory` / `resilient-llm-client` | Provider selection + per-request heuristic fallback on provider failure |
| `heuristic-llm-client` | Deterministic, zero-network AI engine (offline demos, tests, no-key mode) |
| `constraint-engine` | Hard filters (allergies **fail closed**, budget, time, equipment, keep-original) |
| `candidate-generator` | Builds additions / substitutions / modifications, culture-aware strategies |
| `ranking-engine` | Weighted-additive heuristic ranking + LLM ordering/explanation + diversity guardrail |
| `meal-completion` | Weighted-posterior inference from onboarding A/B answers (cold-start profile) |
| `preference-learning` | Confidence-weighted preference rows that grow/shrink with signals |
| `taste-memory` | Per-context affinity store + Culinary Compass seeding + Taste Journal |
| `rescue-allowance` | Server-authoritative quota: free=3/day, pro=∞, credits, pro-pass — client never decides |
| `fridge-negotiator` / `leftover-alchemist` | Pantry-driven meal ideas and leftover transformations |
| `notifications` | Rescue Windows (median-mealtime cron), Spoiler Alert scanner, quiet hours, dedupe ledger, OneSignal sender |

---

## Deterministic-First AI Pipeline

**The single most important design principle in this codebase:**

> **LLMs rank and explain. They never decide alone.**

```
Input → AI Extraction → Structured JSON → Validation → Constraint Engine
     → Candidates → LLM Ranking → Safety Validation → Output
```

1. **AI extraction** produces *structured, zod-validated* JSON only (`MealAnalysisResponse`, `RescueGenerateRequest`)
2. The **constraint engine** applies hard, deterministic rules first — a declared allergy always rejects a candidate (fails closed); missing equipment filters; budget/time are enforced in code, not in prose
3. The **candidate generator** produces a bounded candidate set from a curated, in-code ingredient knowledge base
4. The **LLM only re-orders and writes explanations** for candidates that already survived deterministic filtering — it cannot invent, and it cannot single-handedly fail a candidate through the funnel
5. A final **safety validation** layer re-checks the output before it reaches the user

If the LLM provider dies mid-request, the **ResilientLlmClient** degrades to the deterministic `HeuristicLlmClient` *for that request* — no 502s, no blank screens. If there's no `OPENAI_API_KEY` at all, the entire product still works offline on heuristics. One config line flips the whole pipeline between real AI and deterministic fallback.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Monorepo** | npm workspaces · Turborepo 2 · npm@11 |
| **Backend** | Node.js ≥ 20 · Fastify 5 · TypeScript (strict, ES2022) |
| **Database** | PostgreSQL 15 · Sequelize 6 · pg |
| **Cache** | Redis 7 (ioredis) — optional, graceful degradation |
| **Auth** | JWT (@fastify/jwt) · bcryptjs (12 rounds) · Firebase cutover point wired |
| **AI layer** | OpenAI-compatible client (OpenRouter, GLM-5.2 / GLM-5V) · sharp image optimization · deterministic heuristic fallback |
| **Validation** | zod + zod-validation-error |
| **Mobile** | Expo SDK 57 · React Native 0.86 · React 19 · TypeScript 6 |
| **Mobile libraries** | @react-navigation · zustand · @tanstack/react-query · axios · expo-camera / image-picker / speech-recognition / haptics · reanimated · react-native-svg |
| **Payments** | RevenueCat (react-native-purchases + server webhook) |
| **Push** | OneSignal |
| **Tests** | Jest + ts-jest · fastify.inject · GH Actions with real PostgreSQL service |
| **Tooling** | ESLint (typescript-eslint) · Prettier (import sorting) · husky + lint-staged · tsx |
| **Containers** | Docker (multi-stage, non-root) · docker-compose |

---

## Repository Layout

```
meal-rescue/
├── apps/
│   ├── backend/                # Fastify API — the intelligence
│   │   └── src/
│   │       ├── config/         # zod-validated env (fails fast at boot)
│   │       ├── database/models # 10 Sequelize models + associations
│   │       ├── lib/            # AppError hierarchy, JWT, timing-safe helpers
│   │       ├── middleware/     # auth hook, error handler, zod formatter
│   │       ├── modules/        # auth (routes/schemas/service)
│   │       ├── routes/         # 11 route modules (see API table below)
│   │       ├── plugins/        # Redis plugin (graceful degradation)
│   │       └── services/       # AI layer + all domain services
│   └── mobile/                 # Expo app — the experience
│       └── src/
│           ├── components/     # chips, buttons, ads sheets, mascot, plate-diff…
│           ├── hooks/          # useDayPhase, useEntitlement, usePaywallNudge…
│           ├── navigation/     # 5-tab navigator + gated onboarding flow
│           ├── screens/        # 14 production screens
│           ├── services/       # typed API clients (axios + error contract)
│           ├── stores/         # zustand auth + monetization
│           └── theme/          # design tokens + motion
├── packages/
│   ├── shared-types/           # ★ single source of truth for the API contract
│   ├── ui-components/          # shared RN components
│   └── ai-pipeline/            # (pipeline lives in backend/src/services/ai)
├── infrastructure/             # Docker / K8s / Terraform
├── docs/                       # demo script, superpowers specs & plans
├── scripts/setup/              # dev-setup.ps1 / .sh
├── tests/                      # e2e / integration / unit roots
├── docker-compose.yml          # postgres 15 + redis 7 + backend
├── meal-rescue-project/        # full engineering documentation suite
└── PROGRESS.md                 # 500-line build log, per phase
```

---

## Backend API

All endpoints under `/api/v1`. Swagger UI live at `/docs` in dev.

| Module | Endpoints |
| --- | --- |
| **Auth** | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` |
| **Meal** | `POST /meal/analyze` (multipart photo) · `POST /meal/analyze` (JSON text) |
| **Rescue** | `POST /rescue/generate` · `GET /rescue/:id` |
| **Feedback** | `POST /rescue/:id/feedback` |
| **Pantry** | `GET /pantry` · `POST /pantry` · `DELETE /pantry/:id` |
| **User** | `GET /user/me` · `GET /user/preferences` · `GET /user/insights` · taste journal & culture endpoints |
| **Onboarding** | `POST /user/onboarding/start` · `POST /user/onboarding/answer` · `GET /user/onboarding/summary` · Compass seed |
| **Fridge** | `POST /fridge/negotiate` |
| **Leftovers** | `POST /leftover/transform` |
| **Ads** | `GET /ads/eligibility` · `POST /ads/rewards/rescue-fuel` · `POST /ads/rewards/pro-pass` |
| **Notifications** | various push/snooze endpoints |
| **Webhooks** | `POST /webhooks/revenuecat` (timing-safe, lifecycle → tier flip) |
| **System** | `GET /health` |

**Structured errors everywhere** — every failure returns:

```json
{
  "success": false,
  "error": {
    "category": "CONSTRAINT_CONFLICT",
    "code": "NO_FEASIBLE_RESCUE",
    "message": "No candidate survived your constraints",
    "recoverable": true,
    "suggestedAction": "Relax a constraint to unlock alternatives"
  },
  "requestId": "…",
  "timestamp": "…"
}
```

AI, cache, and provider failures never leak to clients.

---

## Personalization & Learning

The system is built around **memory, not sessions**.

1. **Onboarding (meal-completion)** — new users answer a short deck of A/B pairing cards ("Which finishes this rice bowl better — chickpeas or pickled crunch?"). Latent addition factors (nutritional, sensory, satisfaction, modification, exploration) are inferred with a weighted-posterior model into a **cold-start profile** with confidence states: `unknown → inferred → confirmed`.
2. **Taste Memory Bank** — every rescue decision (accept/reject/swap/feedback) writes a *context-scoped* affinity entry. Likes are never stored as a blanket global score; they're bound to cuisine, meal time, meal pattern, and ingredient × meal group.
3. **Culinary Compass** — 8 culinary families with signature ingredients, ambiguous-keyword matchers, explicit cuisine intent detection (explicit intent always wins), and a seedable tradition↔modern axis. Copy is always framed as *learning*, never a stereotype.
4. **Ranking integration** — cold-start priors and recency feed directly into the ranker alongside a safety gate and diversity guardrail (anti-fatigue). Real feedback **promotes** confirmed signals once behavior lands.
5. **Taste Journal** — surfaces the journey back to the user: learned entries, personality shifts, milestones, corrections, and culture.

---

## Startup Guide

### Prerequisites

- **Node.js ≥ 20** (npm ≥ 11)
- **Docker Desktop** running (for PostgreSQL 15 + Redis 7)
- Optional but recommended: an **OpenRouter** (or OpenAI-compatible) API key for live AI instead of the deterministic engine

### Quick start

```bash
# 1. One-time setup: install deps + start postgres/redis + create .env files
./scripts/setup/dev-setup.ps1    # Windows
./scripts/setup/dev-setup.sh     # macOS / Linux

# 2. Start the API            → http://localhost:3000  (Swagger at /docs)
npm run dev --workspace @meal-rescue/backend

# 3. Start the mobile app     → Expo dev server
npm run dev --workspace @meal-rescue/mobile
```

> **Android emulator?** Use `http://10.0.2.2:3000` for `EXPO_PUBLIC_API_BASE_URL` (loopback note in `apps/mobile/.env.example`).

### Components-only (docker)

```bash
npm run docker:up      # postgres + redis + backend
npm run docker:down    # tear down
```

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run build` | Build all workspaces via Turborepo |
| `npm run typecheck` | TypeScript strict check across workspaces |
| `npm run lint` | ESLint across workspaces |
| `npm test` | Unit + integration tests (backend, via turbo) |
| `npm run format` | Prettier write (ts/tsx/md/json/yaml) |
| `npm run db:migrate` | Run Sequelize migrations |
| `npm run dev --workspace @meal-rescue/backend` | Backend dev server (tsx watch) |
| `npm run dev --workspace @meal-rescue/mobile` | Expo dev server |

---

## Configuration

### Backend (`apps/backend/.env`, see `.env.example`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` / `REDIS_DISABLED` | Redis for vision cache + rate-limit; disable for graceful degradation |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Auth signing (must be strong in production) |
| `OPENAI_API_KEY` | **The switch**: present → real LLM pipeline (OpenRouter-compatible, `LLM_MODEL_VERSION`); absent → deterministic heuristic engine |
| `ANTHROPIC_API_KEY` | Reserved provider slot |
| `RATE_LIMIT_*` | Global request rate limiting |
| `CORS_ORIGIN` | Comma-separated origins or `*` |
| `SENTRY_DSN` | Monitoring |
| `TEST_DATABASE_URL` | Used by integration tests (`NODE_ENV=test`) |

Production boots **fail-fast**: a missing `DATABASE_URL` or a default `JWT_SECRET` aborts startup.

### Mobile (`apps/mobile/.env`, see `.env.example`)

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Backend base URL (public — inlined into the bundle) |
| `EXPO_PUBLIC_FIREBASE_*` | Firebase (optional until provisioned) |
| `EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY` | In-app purchases |
| `EXPO_PUBLIC_ONE_SIGNAL_APP_ID` | Push notifications |

All SDKs no-op safely when their keys are absent — dev builds never crash.

---

## Testing & CI

- **Backend** — Jest + ts-jest; unit suites plus **DB-gated integration suites** that run the *full funnel through `fastify.inject()`* (analyze → generate → alternatives → feedback → pantry CRUD → ads/allowance ledger). They auto-skip when `TEST_DATABASE_URL` is unset and run against a real PostgreSQL 15 service container in CI.
- **Mobile** — lint + strict typecheck + `expo-doctor` enforced in CI (on-device E2E and unit tests land as screens gain testable logic).
- **GitHub Actions** (`.github/workflows/ci.yml`) — on push/PR to `main`/`develop`:
  `lint → typecheck → test-backend (real Postgres) → build-backend → build-mobile` — gated sequentially, with jest output mirrored into the run summary.

Pre-commit (husky + lint-staged) auto-lints and formats staged files.

---

## Engineering Principles

1. **Deterministic-first AI** — LLMs rank and explain; they never decide alone. Safety gates live in code.
2. **Rescues are first-class database objects** — every recommendation persists the meal, candidates, decision, and outcome so the system can genuinely learn.
3. **Structured errors everywhere** — one error contract across the whole app, with `requestId`, recoverability, and a suggested action.
4. **Graceful degradation** — cache down? serve anyway. Vision model down? fall to text. No key? run deterministic. Provider dies mid-request? fall back per-request.
5. **Server-authoritative monetization** — the client never decides entitlement; quotas, credits, and ad rewards are enforced and ledgered server-side, idempotent and replay-proof.
6. **Contract-first monorepo** — every cross-boundary payload validates against `@meal-rescue/shared-types` before it leaves the server.
7. **Composition root** — no service talks to providers/config directly; `composition.ts` owns the wiring.
8. **Fail-fast config** — zod-validated env, production guards on secrets, boot aborts on misconfiguration.

---

## Development Status

Completed through the design-polish and personalization phases. Fully green: backend ~17 suites / 100+ tests, all workspaces lint/typecheck/build clean, CI pipeline green end-to-end.

- [x] **Phase 1 — Foundation**: monorepo, Fastify scaffold, Sequelize models, Expo shell, JWT auth, Docker, CI
- [x] **Phase 2 — Core AI Pipeline**: vision analysis, constraint engine, candidate generation, ranking, safety validation
- [x] **Phase 3 — Mobile Frontend**: full core loop — capture → review → result → feedback
- [x] **Phase 4 — Personalization & Learning**: feedback, preference learning, pantry, taste memory
- [x] **Phase 4b — Meal Completion Onboarding**: adaptive A/B preference onboarding + cold-start ranking integration
- [x] **Phase 5 — Advanced Features**: Fridge Negotiator, Leftover Alchemist, voice input
- [x] **Phase 6 — Real AI**: GLM-5.2 / GLM-5V via OpenRouter + resilient per-request fallback
- [x] **Phase 7 — Monetization & Engagement**: RevenueCat Pro, Rescue Fuel, Pro Pass, Rescue Windows, Spoiler Alert
- [x] **Phase 8 — Design Award Polish**: motion, PlateDiffReveal, Scraps the Cat, confetti, adaptive paywall
- [x] **Cultural Awareness (Culinary Compass)**: culture-learner + taste journal integration
- [ ] **Hardening**: initial Sequelize migration, on-device E2E, store submission (EAS), iOS build

See `PROGRESS.md` for the complete per-phase build log, decisions, and deviations.

---

## Contributing

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- Pre-commit hooks lint + format staged files automatically
- Keep changes deterministic-first: AI layer stays behind the `LlmClient` seam
- Extend `shared-types` first when the API contract changes — both apps must stay in sync

---

*Meal Rescue — the smallest change that makes a meal better.* 🐱