## Task 2: Backend - Plan preview service

**Files:**
- Create: apps/backend/src/services/plan-preview.service.ts

**Steps:**
1. Create service with in-memory Map store, TTL cleanup, checkPlanLimit, generatePreview, confirmPreview
2. Verify typecheck
3. Commit

**Requirements:**
- In-memory Map store with 15-minute TTL
- checkPlanLimit(userId): returns tier, daysUsed, daysRemaining
- generatePreview(userId, planningResult): creates preview, returns PlanPreviewResponse
- getPreview(previewId): returns preview or undefined
- confirmPreview(previewId, edits?): validates, returns success/preview
- FREE_PLAN_DAY_LIMIT = 3
- AppError for NOT_FOUND and FORBIDDEN
- Cleanup interval runs every 5 minutes, uses .unref()
