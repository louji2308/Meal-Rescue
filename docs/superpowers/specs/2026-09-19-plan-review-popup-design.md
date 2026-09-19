# Plan Review Popup + Subscription Gating

## Overview

Add a review step before any AI-generated meal plan is saved. Free users get a 3-day lifetime limit. Plans exceeding the limit show in full preview but require Pro to save.

## Rules

- Free tier: 3 days planned total, lifetime counter, no reset
- Per request: each planning request plans exactly 1 day
- Free exceeded: show full plan preview, require Pro to save
- Pro tier: unlimited planning
- Ad bypass: none for planning (only rescues have pro-pass)
- Edit gating: editing a plan beyond free limit requires Pro
- Payment success: save the plan immediately after successful purchase

## Backend Changes

### 1. User Model: planDaysUsed field

Add `plan_days_used` INTEGER column, default 0, NOT NULL. Tracks lifetime days planned. Never decrements. Updated only on plan confirmation.

### 2. New endpoint: POST /api/v1/meal-memory/plan-preview

Purpose: Generate a plan without persisting it.

Request body: `{ "text": "help me plan for tomorrow" }`

Response:
```json
{
  "previewId": "uuid",
  "days": [
    {
      "dateKey": "2026-09-20",
      "meals": [
        { "slot": "breakfast", "concept": "Overnight oats", "reason": "Uses berries expiring soon" },
        { "slot": "lunch", "concept": "Chicken wrap", "reason": "Quick prep" }
      ]
    }
  ],
  "daysPlanned": 1,
  "daysUsedBefore": 2,
  "daysRemainingAfter": 0,
  "requiresPayment": false,
  "message": "Here is your plan for tomorrow."
}
```

If user requests 7 days but only 2 remaining on free tier, the preview still shows all 7 days with `requiresPayment: true`.

### 3. New endpoint: POST /api/v1/meal-memory/plan-confirm

Purpose: Save a previously previewed plan.

Request body: `{ "previewId": "uuid", "edits": "optional text" }`

Flow:
1. Look up the preview from temporary store (Redis or in-memory Map with 15min TTL)
2. If edits provided, re-run planning with edits applied
3. Check user planDaysUsed + subscriptionTier
4. If free tier and daysPlanned exceeds remaining -> return 402
5. If OK: persist plan, increment planDaysUsed
6. Return success

### 4. Preview storage

Use an in-memory Map with 15-minute TTL. Key: previewId, Value: { userId, plan data, createdAt }. No DB table needed.

### 5. Subscription check helper

```typescript
async function checkPlanLimit(userId: string) {
  const user = await User.findByPk(userId);
  if (user.subscriptionTier === 'pro') return { tier: 'pro', daysUsed: user.planDaysUsed, daysRemaining: Infinity };
  return { tier: 'free', daysUsed: user.planDaysUsed, daysRemaining: Math.max(0, 3 - user.planDaysUsed) };
}
```

## Mobile Changes

### 1. New component: PlanReviewPopup

A centered modal with dark overlay. Entry animation: scale from 0.8 to 1.0 with spring physics. Overlay fades in from 0 to 0.5 opacity.

Shows: date header, meal cards (slot + concept + reason), free days usage counter, action buttons.

If requiresPayment: shows upgrade prompt instead of Accept button.

### 2. Edit mode

When Edit tapped: text input appears with placeholder "Tell me what to change...". Apply button regenerates plan via plan-preview endpoint with edits appended.

### 3. Payment flow

When Upgrade tapped: opens PaywallScreen. On purchase success: calls plan-confirm to save the plan. Uses a callback pattern - PaywallScreen accepts an onSuccess prop.

### 4. Store changes

Add to meal-memory store:
- `planPreview: PlanPreview | null` - current preview data
- `showPlanReview: boolean` - popup visibility
- `requestPlanPreview(text)` - calls plan-preview endpoint
- `confirmPlan(previewId, edits?)` - calls plan-confirm endpoint
- `cancelPlanReview()` - clears preview

Modify sendIntent: for PLAN_DAY and PLAN_WEEK intents, call requestPlanPreview instead of the old intent flow.

### 5. Flow diagram

```
User types "plan for tomorrow"
  -> requestPlanPreview(text)
    -> POST /api/v1/meal-memory/plan-preview
      -> checkPlanLimit(userId)
      -> classifyIntent -> PlanningEngine.planWeek (without persist)
      -> return preview with limit info
  -> Show PlanReviewPopup with preview data

User taps Accept (within free limit):
  -> confirmPlan(previewId)
    -> persist plan to DB
    -> increment planDaysUsed
  -> Reload week, dismiss popup

User taps Edit:
  -> Text input appears
  -> User types "make it vegetarian"
  -> requestPlanPreview("plan for tomorrow vegetarian")
  -> Popup refreshes with new plan

User taps Upgrade:
  -> Open PaywallScreen
  -> User purchases
  -> On success: confirmPlan(previewId)
  -> Save plan, dismiss popup

User taps Cancel:
  -> Dismiss popup, no save
```
