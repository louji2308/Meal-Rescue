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
