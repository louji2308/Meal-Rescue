## Task 3: Backend - Plan review routes

**Files:**
- Create: apps/backend/src/routes/plan-review.routes.ts
- Modify: apps/backend/src/app.ts

**Steps:**
1. Create POST /plan-preview and POST /plan-confirm routes
2. Register in app.ts
3. Verify typecheck
4. Commit

**Requirements:**
- POST /plan-preview: accepts { text: string }, generates plan via planning engine in preview mode, returns PlanPreviewResponse
- POST /plan-confirm: accepts { previewId: uuid, edits?: string }, confirms and saves plan
- Routes use FastifyInstance pattern
- Use zod for request validation
- Use AppError for validation errors
- Register routes with prefix '/api/v1/plan-review'
- Import and register in app.ts after subscription routes
