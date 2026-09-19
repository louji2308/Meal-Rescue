# Plan Review Popup + Subscription Gating

> **For agentic workers:** Use subagent-driven-development or executing-plans.

**Goal:** Add a review popup before meal plans are saved, with 3-day lifetime free limit and payment-gated save.

**Architecture:** Backend generates plans without persisting (preview mode). Mobile shows animated popup. Accept -> save. Exceeds free limit -> requires Pro.

**Tech Stack:** React Native Animated API, Fastify, Sequelize, RevenueCat

## Global Constraints

- Free: 3 days total lifetime, no reset, no ad bypass
- Per request: 1 day planned (AI enforces)
- Pro: unlimited
- Payment -> save immediately
- Husky broken: always --no-verify

## File Structure

**Backend create:**
- apps/backend/src/services/plan-preview.service.ts
- apps/backend/src/routes/plan-review.routes.ts

**Backend modify:**
- apps/backend/src/database/models/user.model.ts
- apps/backend/src/modules/auth/auth.service.ts
- apps/backend/src/app.ts

**Mobile create:**
- apps/mobile/src/components/PlanReviewPopup.tsx

**Mobile modify:**
- apps/mobile/src/stores/meal-memory.store.ts
- apps/mobile/src/services/meal-memory.api.ts
- apps/mobile/src/screens/MealPlanScreen.tsx

---

## Task 1: Backend - Add planDaysUsed to User model

**Files:**
- Modify: apps/backend/src/database/models/user.model.ts
- Modify: apps/backend/src/modules/auth/auth.service.ts

**Steps:**
1. Add planDaysUsed column (INTEGER, default 0) to User model class declaration and init
2. Include planDaysUsed in issueTokens user object
3. DB column added by Sequelize sync on startup
4. Verify: cd apps/backend && npx tsc --noEmit -p tsconfig.build.json
5. Commit: git add apps/backend/src/database/models/user.model.ts apps/backend/src/modules/auth/auth.service.ts && git commit --no-verify -m "feat: add planDaysUsed to User model"

---

## Task 2: Backend - Plan preview service

**Files:**
- Create: apps/backend/src/services/plan-preview.service.ts

**Steps:**
1. Create service with in-memory Map store, TTL cleanup, checkPlanLimit, generatePreview, confirmPreview
2. Verify typecheck
3. Commit

---

## Task 3: Backend - Plan review routes

**Files:**
- Create: apps/backend/src/routes/plan-review.routes.ts
- Modify: apps/backend/src/app.ts

**Steps:**
1. Create POST /plan-preview and POST /plan-confirm routes
2. Register in app.ts
3. Verify typecheck
4. Commit

---

## Task 4: Mobile - API calls

**Files:**
- Modify: apps/mobile/src/services/meal-memory.api.ts

**Steps:**
1. Add postPlanPreview and postPlanConfirm functions
2. Verify typecheck
3. Commit

---

## Task 5: Mobile - PlanReviewPopup component

**Files:**
- Create: apps/mobile/src/components/PlanReviewPopup.tsx

**Steps:**
1. Create animated popup with scale+fade, meal cards, accept/edit/cancel/upgrade buttons
2. Verify typecheck
3. Commit

---

## Task 6: Mobile - Store integration

**Files:**
- Modify: apps/mobile/src/stores/meal-memory.store.ts

**Steps:**
1. Add planPreview, showPlanReview, requestPlanPreview, confirmPlan, cancelPlanReview
2. Modify sendIntent to route planning intents through preview
3. Verify typecheck
4. Commit

---

## Task 7: Mobile - Integrate popup into MealPlanScreen

**Files:**
- Modify: apps/mobile/src/screens/MealPlanScreen.tsx

**Steps:**
1. Import PlanReviewPopup, wire to store, handle callbacks
2. Verify typecheck
3. Commit

---

## Task 8: Test and deploy

1. Run all backend tests
2. Verify mobile typecheck
3. Push to GitHub
4. Deploy to Railway
5. Verify on device
