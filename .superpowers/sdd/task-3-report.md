## Task 3: Backend - Plan review routes

**Status:** DONE

### Commits created
- `df4221a` feat(backend): add plan review routes for preview and confirm

### What was done
1. Created `apps/backend/src/routes/plan-review.routes.ts` with:
   - `POST /plan-preview`: Accepts `{ text: string }`, runs planning engine in preview mode (no persistence), stores preview with 15-min TTL, returns `PlanPreviewResponse`
   - `POST /plan-confirm`: Accepts `{ previewId: uuid, edits?: string }`, confirms and saves the previewed plan

2. Added `previewMode` option to `PlanParams` in `planning-engine.ts` to skip database persistence when generating previews

3. Registered routes in `app.ts` with prefix `/api/v1/plan-review`

### Implementation details
- Used zod for request validation with strict schemas
- Used `AppError` for structured error handling (validation errors, not found)
- Replicated planWeek logic from `meal-memory.service.ts` but called `planPreviewService.generatePreview()` instead of persisting directly
- The `convertEventsToPlannedDays` helper transforms `MealEvent[]` into `PlannedDay[]` format for the preview service

### Test summary
- Typecheck passes with no errors

### Concerns
None
