# Onboarding Taste Quiz + Pricing Fix

## Overview

Move the Taste Quiz from an optional Profile modal to an auto-triggered onboarding flow after first login. Add a new multi-select cuisine question as step 1, keeping the existing 6 A/B pair questions as steps 2-7. Fix the $79.99 lifetime plan label.

## Changes

### 1. Pricing Fix

**File:** `apps/mobile/src/screens/PaywallScreen.tsx`

- Change `STATIC_PRICING` entry: `{ id: 'lifetime', title: 'Lifelong', price: '$79.99' }`
- In the render logic, when `id === 'pro_lifetime'` or `id === 'lifetime'`, prefer our static title over `pkg.product?.title` to avoid RevenueCat/Store titles showing "Pro"

### 2. New Onboarding Flow (7 steps)

#### Step 1 — "What cuisines do you love?"

- 2-column scrollable grid
- Each cell: bundled food image (80×80) + cuisine name (bold 16px) + 2-3 examples (gray 12px)
- Multi-select toggle using Chip-style spring animation (reuse `Chip` component pattern)
- Minimum 1 selection to enable "Continue" button
- Progress bar: "Step 1 of 7"

**Cuisine options (10):**

| Key | Display Name | Examples | Image Asset |
|-----|-------------|----------|-------------|
| `italian` | Italian | Pizza, pasta, risotto | `cuisine-italian.png` |
| `indian` | Indian | Curry, biryani, dosa | `cuisine-indian.png` |
| `mexican` | Mexican | Tacos, burritos, mole | `cuisine-mexican.png` |
| `east_asian` | East Asian | Ramen, stir-fry, pho | `cuisine-east-asian.png` |
| `mediterranean` | Mediterranean | Falafel, hummus, shawarma | `cuisine-mediterranean.png` |
| `american` | American | Burgers, BBQ, soul food | `cuisine-american.png` |
| `middle_eastern` | Middle Eastern | Kebabs, tabbouleh, shakshuka | `cuisine-middle-eastern.png` |
| `african` | African | Jollof, injera, tagine | `cuisine-african.png` |
| `caribbean` | Caribbean | Jerk, plantains, roti | `cuisine-caribbean.png` |
| `thai` | Thai | Pad thai, green curry, som tum | `cuisine-thai.png` |

#### Steps 2-7 — Existing A/B Pair Questions

- Identical behavior to current `TasteOnboardingScreen`
- Reuse existing `pair-catalog.ts` and `answerOnboarding` endpoint
- Each step: "Which addition completes this meal better?" with two options

### 3. Backend Changes

#### 3a. Extend `CulinaryFamily` type

**File:** `packages/shared-types/src/index.ts`

Add `african`, `caribbean`, `thai` to the `CulinaryFamily` union type.

#### 3b. New endpoint: `POST /api/v1/user/taste/onboarding/cuisines`

**File:** `apps/backend/src/routes/user.routes.ts`

- Body: `{ cuisines: CulinaryFamily[] }`
- Validates against the extended `CulinaryFamily` enum
- For each selected cuisine, calls `tasteMemory.seedCompass(userId, { family: cuisine, traditionVsModern: 0 })`
- Sets `onboardingStarted: true` on user record

#### 3c. User model: `onboardingCompleted` flag

**File:** `apps/backend/src/database/models/user.model.ts`

- Add `onboardingCompleted: boolean` field, default `false`
- Set to `true` after the final A/B pair answer (step 7)

#### 3d. Modified `startOnboarding`

**File:** `apps/backend/src/services/meal-completion.service.ts`

- If `onboardingCompleted === true`, return `{ completed: true }`
- If `onboardingStarted === false`, return step 1 (cuisine question marker)
- If `onboardingStarted === true` but not completed, return next A/B pair

### 4. Mobile Navigation Changes

#### 4a. New `OnboardingScreen`

**File:** `apps/mobile/src/screens/OnboardingScreen.tsx` (new)

- Multi-step wizard screen
- Step 1: Cuisine multi-select grid
- Steps 2-7: A/B pair questions (port from current `TasteOnboardingScreen`)
- Progress bar across all 7 steps
- "Skip for now" button (exits to tabs, onboarding remains incomplete)

#### 4b. Update `AppNavigator.tsx`

- Add `Onboarding: undefined` to `RootStackParamList`
- Register `Onboarding` screen in `RootStack.Navigator`
- After login, check `onboardingCompleted` status:
  - If `false` → navigate to `Onboarding`
  - If `true` → navigate to `Tabs`

#### 4c. Remove from Profile

**File:** `apps/mobile/src/screens/ProfileScreen.tsx`

- Delete the "Taste Quiz" row (lines 203-216)
- Keep "Taste Journal" row

#### 4d. Delete old screen

- Remove `TasteOnboardingScreen.tsx` after migration
- Remove `TasteOnboarding` from `RootStackParamList`

### 5. API Layer

**File:** `apps/mobile/src/services/taste.api.ts`

- Add `submitCuisinePreferences(cuisines: CulinaryFamily[]): Promise<void>`
- Modify `startOnboarding()` to return `{ completed: boolean; step: number; pair?: OnboardingPair }`

### 6. UI Layout (Step 1)

```
┌─────────────────────────────┐
│  Skip for now               │
│                             │
│  What cuisines do           │
│  you love?                  │
│  Select all that apply      │
│                             │
│  ┌───────────┐ ┌──────────┐│
│  │  [image]  │ │ [image]  ││
│  │  Italian  │ │  Indian  ││
│  │ Pizza,    │ │ Curry,   ││
│  │ pasta,    │ │ biryani, ││
│  │ risotto   │ │ dosa     ││
│  └───────────┘ └──────────┘│
│  ┌───────────┐ ┌──────────┐│
│  │  [image]  │ │ [image]  ││
│  │  Mexican  │ │  East    ││
│  │ Tacos,    │ │  Asian   ││
│  │ burritos, │ │ Ramen,   ││
│  │ mole      │ │ stir-fry ││
│  └───────────┘ └──────────┘│
│  ... (scrollable)           │
│                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Step 1 of 7                │
│                             │
│  [Continue →]               │
└─────────────────────────────┘
```

Selected state: black border (#000000) + light gray background (#F0F0F0), matching existing `Chip` component.

### 7. Taste Memory Integration

**Step 1 (cuisines):**
- Each selected cuisine → `seedCompass({ family, traditionVsModern: 0 })`
- Creates `cuisine_family` context entries with affinity 0.8, confidence 0.5
- Pipeline reads `getCuisineAffinities()` to bias recommendations toward selected cuisines

**Steps 2-7 (A/B pairs):**
- Flow via existing `answerOnboarding` → `applyAnswer` → taste memory cells
- No changes needed to existing backend logic

### 8. Bundle Assets

**Directory:** `apps/mobile/assets/cuisines/`

Add 10 bundled food images (PNG, ~80×80pt @2x = 160×160px):
- `cuisine-italian.png`
- `cuisine-indian.png`
- `cuisine-mexican.png`
- `cuisine-east-asian.png`
- `cuisine-mediterranean.png`
- `cuisine-american.png`
- `cuisine-middle-eastern.png`
- `cuisine-african.png`
- `cuisine-caribbean.png`
- `cuisine-thai.png`

Style: minimal illustration or food photo, consistent sizing, white or transparent background.

## File Impact Summary

| File | Action |
|------|--------|
| `apps/mobile/src/screens/PaywallScreen.tsx` | Edit (pricing fix) |
| `apps/mobile/src/screens/OnboardingScreen.tsx` | Create (new) |
| `apps/mobile/src/screens/TasteOnboardingScreen.tsx` | Delete |
| `apps/mobile/src/screens/ProfileScreen.tsx` | Edit (remove Taste Quiz row) |
| `apps/mobile/src/navigation/AppNavigator.tsx` | Edit (add Onboarding route, login redirect) |
| `apps/mobile/src/services/taste.api.ts` | Edit (add cuisine endpoint, modify startOnboarding) |
| `packages/shared-types/src/index.ts` | Edit (extend CulinaryFamily) |
| `apps/backend/src/routes/user.routes.ts` | Edit (add cuisines endpoint) |
| `apps/backend/src/services/meal-completion.service.ts` | Edit (onboarding status check) |
| `apps/backend/src/database/models/user.model.ts` | Edit (add onboardingCompleted field) |
| `apps/mobile/assets/cuisines/` | Create (10 image assets) |
