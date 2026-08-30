# Meal Rescue — Meal-Completion Preference Learning (V1) — Design Spec

> **Status:** Approved for implementation.
> **Type:** Design spec (context + architecture). Backed by an implementation plan produced separately via superpowers:writing-plans.
> **Related:** Replaces the Culinary Compass onboarding. Extends the existing `taste_memories` / `preferences` learning system.
> **Brief anchors:** Shipaton 2026 — Abbey's Kitchen award (additive, flexible, no calorie/macro counting, no rigid plans); Abbey Sharp's Hunger Crushing Combo (combine protein + fibre + healthy fat while preserving enjoyment).

---

## 1. Vision & Problem

The app's core value: *"Given food you already have, what addition makes this meal more satisfying for you?"*

New users currently go through a cuisine-family Compass (pick 1 of 7 families + a tradition slider) that teaches nothing about meal additions. V1 replaces it with a short **adaptive A/B onboarding** that cold-starts a **Meal-Completion Preference Profile** — a hypothesis about how this person likes to complete meals — which **immediately influences recommendation ranking** and **gradually yields to real behavior** over time.

**Guiding principle:** *Onboarding gives the AI a hypothesis. Actual eating behavior proves or disproves it.*

**Philosophy anchor (Abbey Sharp / Shipaton):** additive, enjoyment-preserving personalization — no calorie counting, no macro tracking, no restrictive diet plans. Product language stays at *"this can make the meal more satisfying"* — never unsupported claims about physiology (e.g. *"will keep you full for 5 hours"*, *"you are deficient in protein"*). Research supports sensory/texture/prior-experience as relevant to satiation and acceptance, but effect sizes vary by food and context; the product must not pretend to precisely predict physiology.

---

## 2. Scope

### In scope (V1)

1. **Adaptive A/B onboarding** — replaces `CulinaryCompassScreen`.
2. **Cold-start latent profile** over 5 latent factors, with explicit confidence states.
3. **Personality view** — read-only interpretation of the profile (never drives ranking).
4. **Ranking integration** — affinities + generic meal-context prior + weighted additive score, immediately applied to the first recommendation.
5. **Anti-fatigue / diversity layer** — soft, guardrailed.
6. **Rich event model** with structured rejection reasons and an `UNAVAILABLE` state.

### Out of scope (V1) — designed for, not built

- Full per-meal compatibility learning (implicitly learned later from behavior; data model supports it).
- Escalated novelty exploration.
- Cross-meal sequence optimization.

---

## 3. Onboarding UX & Mechanic

- Each screen shows **the same base meal with two different additions**; the user taps which would make the meal better.
- Wording: **"Which would make this meal better for you?"** — measures **anticipated** satisfaction, never real physiology.
- ~6–7 screens.
- Each base meal is labeled with its **cuisine/country** (e.g. "Indian — rice & dal") as **scenario context** only (see §5 cuisine rule).
- Pairs are **diagnostic**: each pair declares explicit `tests` that target latent-factor loadings, so a pair isolates one latent dimension at a time (e.g. animal-protein vs plant-protein familiarity; richness/fat vs freshness; texture/crunch vs soft).

---

## 4. Inference Model

**No probabilistic framework is required.** Maintain a **weighted posterior score** per latent factor, with an explicit onboarding prior and incremental evidence updates:

```
new_affinity_score =
    old_affinity_score  * old_weight
  + evidence_value      * new_weight
```

- **Confidence is separate from score.** It is derived from `evidence_count` and **consistency** (agreement among evidence), not from score magnitude.
- **Confidence states (derived, not stored):** `UNKNOWN → INFERRED → CONFIRMED` (plus `RE-EVALUATE` on contradiction). These are a **read-only interpretation computed from stored fields** — no new columns required.
- **Stored confidence evidence** (maps onto the existing `taste_memories` / `preferences` tables):
  - `confidence` (DECIMAL 3,2) — numeric, already exists
  - `observationCount` — evidence count, already exists
  - `source` — **conceptual** `COLD_START | BEHAVIOR`, **mapped onto** existing concrete values; V1 adds/reuses a `cold_start` value (the current enum is `feedback | accept | swap | reject | profile`)
  - `lastUpdated` — already exists
- **Behavioral override (§10):** a small number of repeated real-world contradictions rapidly down-weighs a cold-start prior.

---

## 5. Five Latent Factors

19 raw dimensions are *not* estimated independently from ~6–7 binary choices. They are grouped into **5 latent factors**; each A/B pair loads onto multiple factors **with different weights** (shared evidence across correlated dimensions):

| Factor | Raw dimensions | Short |
|---|---|---|
| **1. Nutritional completion** | protein, fibre, healthy-fat | `nutritional` |
| **2. Sensory completion** | flavor, texture, freshness, richness, spice | `sensory` |
| **3. Satisfaction target** | fullness, meal-completeness, comfort, variety | `satisfaction` |
| **4. Modification style** | minimal-change, effort, addition-count | `modification` |
| **5. Exploration & acceptance** | familiarity, novelty, uncertainty, food-form | `exploration` |

### Cuisine/country rule

**Cuisine/country labels are scenario context metadata only. They MUST NOT update any cuisine preference during cold-start onboarding.** Choosing "egg" for "Indian — rice & dal" must never produce `Indian cuisine affinity += ...`. Cuisine factors may only be learned later from sustained real behavior, orthogonally to onboarding.

### Context-type extension (verified against code)

The existing `TasteMemoryContextType` union is `cuisine | meal_time | meal_pattern | cuisine_family | tradition_vs_modern | global`. V1 **adds** the following context types to persist the latent factors and meal-group evidence (the `context_type` column is `STRING(50)`, so no migration barrier, but the TS union and any switch over it must be extended):

- `addition_nutritional` / `addition_sensory` / `addition_satisfaction` / `addition_modification` / `addition_exploration` — one per latent factor, with `context_value` = ingredient and `affinity` = that factor's score.
- `addition_x_meal_group` — paired meal-context evidence, with `context_value` = `<ingredient>_x_<meal_group>` (e.g. `egg_x_rice_based`), `source = cold_start`, low confidence.

---

## 6. Generic Meal-Context Prior

The "light tiebreaker" is a **static generic prior** (before any personal learning):

```
meal_group  ×  addition_role  →  prior_compatibility
```

Example values:
```
egg  ×  rice_based    +0.05
egg  ×  noodle_based  +0.04
egg  ×  sweet_breakfast -0.01
```

This states *"egg is generally a compatible candidate for this meal type"* — **not** *"this user likes egg with rice."* Individual behavior later overrides the generic prior.

---

## 7. Ranking

**Integration note (verified against code):** candidate ranking is currently **LLM-driven** — `RankingEngineService.rankAndExplain()` sends a `CANDIDATE_RANKING_SYSTEM_PROMPT` payload (including `preferences` favorites/avoided) to the LLM and falls back to a deterministic `HeuristicLlmClient` scorer. V1 therefore **extends the existing ranking path** rather than installing a new numeric scorer: the cold-start affinities, generic meal-context prior, freshness (anti-fatigue), and role-family diversity signals are (a) injected into the ranking prompt payload and (b) reinforced in the deterministic fallback scorer. Ranking still ends with **hard filters first**, and the deterministic fallback uses a **weighted additive score — never multiplication**:

```
HARD FILTERS (pass/fail):
  available?   compatible (not contraindicated)?
  allowed?     practical?

score (deterministic fallback / tuning target) =
    w1 * affinity
  + w2 * meal_context_compatibility
  + w3 * practicality
  + w4 * freshness (anti-fatigue)
  + w5 * diversity (role-family balance)
```

Weights are tunable and hard gates prevent any single low factor from collapsing the result.

### Recommendation-safety gate

Before the first real recommendation, if profile confidence is low, surface **safe + familiar + small-exploration** (e.g. Egg / Curd / Roasted peanuts) rather than three highly uncertain suggestions.

---

## 8. Anti-Fatigue & Diversity Layer

- **Soft repetition penalty** that decays: `0` recent appearances → none; `1` → tiny; `2` → moderate; `3+` → strong but temporary.
- **Role-family diversity** (substitutable families): because "wants protein" ≠ "egg forever":
  - `PROTEIN`: egg, paneer, chicken, tofu, chickpeas, greek-yogurt, lentils
  - `CRUNCH`: peanuts, seeds, roasted-chickpeas, nuts
  - `FIBRE / VOLUME`: vegetables, fruit, salad, beans
- **Strategy-type rotation** (e.g. protein today → crunch + healthy-fat tomorrow), when compatible with the meal and profile.
- **GUARDRAIL:** diversity is a **soft objective and must never override strong user affinity, meal compatibility, safety, availability, or practicality.** No forced rotation — if a strongly-preferred, highly-compatible addition exists, it should win.

---

## 9. Event Model

Track the full funnel as **separate** evidence states — never treat exposure as preference:

```
SHOWN  VIEWED  SELECTED  RESCUED  SATISFIED  REJECTED  SKIPPED  UNAVAILABLE
```

- **`UNAVAILABLE`** is retained separately so *"I don't have Greek yogurt"* is **not** learned as negative preference.
- **Structured rejection reasons:**
  - `taste`
  - `too_expensive`
  - `too_much_effort`
  - `don_t_have`
  - `don_t_like_ingredient`
  - `not_appropriate_for_meal`
  - `not_hungry_enough`

Distinction: `shown` ≠ `selected` ≠ `rescued` ≠ `satisfied`. Recommendations are evidence only once they reach the appropriate state.

**Persistence:** the existing `taste_memories`/`preferences` tables store the *outcome* evidence (accept/reject/rescue, via `source`). The richer funnel (`SHOWN`, `VIEWED`, `SELECTED`, `SKIPPED`, `UNAVAILABLE`) and rejection reasons are **not** currently stored per-event — V1 adds a lightweight **addition-event log** (table or in the existing preferences store) recording `addition`, `state`, `rejection_reason?`, `meal_group`, `timestamp`, so the anti-fatigue `freshness` signal and `shown ≠ selected` tracking have real data. This log is also what later upgrades contextual priors into per-meal compatibility.

---

## 10. Behavioral Override

**Observed behavior carries higher evidence weight than cold-start evidence.**

```
Cold-start: egg = 0.80
Behavior:   reject egg, accept peanuts, reject egg again
→ egg affinity drops quickly (high BEHAVIOR weight overrides COLD_START prior)
```

This directly implements the guiding principle: *onboarding = hypothesis; behavior = proof.*

---

## 11. Two-Model Learning Curve

Two related but distinct models:

- **Model 1 — Anticipated preference:** learned during cold start; the prior.
- **Model 2 — Observed satisfaction:** learned from real rescues/feedback; eventually dominates.

Confidence-state transition `UNKNOWN → INFERRED → CONFIRMED` with `source`/`evidence_count`/`last_updated` supports graceful handling of contradictions, so a bad onboarding choice cannot poison recommendations for weeks.

---

## 12. What Gets Deleted / Replaced

- `CulinaryCompassScreen` and its compass flow are removed.
- `AppNavigator.tsx` is rewired so `justOnboarded` routes to the new Meal-Completion onboarding instead of the Compass.
- `seedCompass` / `skipCompass` / compass-related culture APIs are deprecated or repurposed.
- Existing cuisine-family learnings accumulated from real rescues are **kept** as orthogonal meal-context data (still useful).

---

## 13. Extensibility

The data model and learning interfaces are designed so observed rescue behavior can later upgrade contextual priors into **full meal × addition preferences** without migration pain. Personality remains read-only. The §9 addition-event log is the primary feed for that later per-meal compatibility learning.

---

## 14. Open questions / follow-up phases

- Full meal × addition compatibility learning (Phase 2+).
- Escalated novelty exploration.
- Cross-meal sequence optimization.
- Cuisine preference learning from sustained behavior (orthogonal to onboarding).
