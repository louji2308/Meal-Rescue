# Rewrite Plan — Common Table + Meal Plan tab redesign

Status: approved for implementation.
Scope: no content loss — every feature today survives, reshaped into fewer, cleaner screens.

---

## Part 1 — Common Table tab

### 1.1 Rescue tab entrance card
- Replace the thin secondaryCta in `HomeScreen` with a proper full-width entrance card:
  people icon in a tinted circle, title **"Cook for the table"**, subtitle
  **"One meal that works for everyone you cook for"** (or **"Add the people you cook for first"**
  when no household), chevron affordance, surface + border card.
- Remove the duplicate **Common Table** button in `KitchenScreen` (~line 766).

### 1.2 Three-step flow (was 8 screens)
| Step | Screen | Merged | Content |
|---|---|---|---|
| 1 | What Do We Have? | (unchanged) | inline-picked people → ingredients / pantry / effort / time → Find our meal |
| 2 | The Plan ~ Cook | Converge + Cook | plan preview → Start cooking → shared steps → Split point reached → branch steps + finishes → Everyone's served |
| 3 | How Did It Go? | Complete + Feedback | per-person `Loved it / It worked / Not really / Skipped` + overall + optional note → Save and learn → Meal recorded! |

- Delete: `WhoIsEatingScreen`, `ConvergeScreen`, `CookScreen`, `CompleteScreen`, `FeedbackScreen`.
- `CommonTableHomeScreen` hosts inline person selection (tap select / tap unselect) + resume card.
- Backend calls unchanged (`converge → start-cooking → complete → feedback`).

### 1.3 Interaction pattern
- Every chip is a toggle: **tap = select, tap again = unselect**.
- Single-select groups (Effort, Time, strategy): re-tapping the active option resets to default.

### 1.4 Add-People page (replaces the form modal)
Dedicated `AddPeopleScreen`, not a modal sheet. Fields, in order:
1. **Profile photo** — circle + camera button (expo-image-picker); optional; local-only; initials fallback.
2. **Name** — required.
3. **Age group pills — exactly one selected:** `Baby · Child · Adult` (default Adult).
   Retires relationship from the form.
4. **Anything to avoid?** — free text (allergies/dislikes) → hard constraints.
5. **Diets** — optional pills Vegetarian · Vegan · Halal · Keto (multi, tap/un-tap).
6. **Optional** "Help me suggest better" — one free line (e.g. `loves salmon, mild spice`).
- `HouseholdScreen` becomes a roster: list, edit (opens AddPeople prefilled), delete, Add button (opens AddPeople).

### 1.5 Backend/shared-types
- Add `ageGroup: 'baby' | 'child' | 'adult'` (optional, default adult) to member profile,
  create + update payloads; column on `HouseholdMember` model.
- `relationship` stays optional/legacy; removed from the form only.

## Part 2 — Meal Plan tab (renamed from Memory)
- Tab renamed **Meal Plan**, calendar icon.
- One screen, zero sub-tabs:
  1. Week-strip calendar header (Mon–Sun day blocks, today highlighted, `‹ today ›`).
  2. Toolbar: strategy pills `Balanced · Easy · Use expiry` + **Plan this week**.
  3. Focused day: Breakfast/Lunch/Dinner/Snack rows; tap a meal → `Cooked it · Skipped · Loved · Tomorrow · Remove`.
  4. Thin read-only active-rules strip (`no dairy`, kept-out, held).
  5. Pinned command bar; result banner appears above it; calendar updates in place.
- **Rules sub-view deleted.** Rules are conversational: `don't use dairy` (SET_RULE, exists) and
  `forget the dairy rule` (new REMOVE_RULE). Strip only displays, never edits.

## Part 3 — Backend work
- `REMOVE_RULE` intent: classifier pattern (`forget|remove|cancel` + `rule`, ingredient entity),
  in `MUTATIONS_ALWAYS_CONFIRMED`, handler deletes rule by ingredient and returns a message.
- Intent-classifier tests for the new phrases.
- `ageGroup` on model + member create/update.

## Part 4 — Verification
- Backend: typecheck, lint, full test suite.
- Mobile: typecheck, lint.
- E2E on emulator: rescue card → add person (photo/age pills) → pick people → converge → cook → how-did-it-go; Meal Plan tab: rename, plan week, talk intent, rules via talk.