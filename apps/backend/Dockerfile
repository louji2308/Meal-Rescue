# Meal Rescue API - production image
# Multi-stage build; runs as non-root for container security.

FROM node:20-alpine AS builder
WORKDIR /app

# Workspace context: build from repo root so workspace deps resolve.
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared-types/package.json packages/shared-types/

RUN npm install --workspace @meal-rescue/backend --workspace @meal-rescue/shared-types

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend

RUN npm run build --workspace @meal-rescue/shared-types \
  && npm run build --workspace @meal-rescue/backend \
  && npm prune --omit=dev --workspace @meal-rescue/backend

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/packages/shared-types/dist ./node_modules/@meal-rescue/shared-types/dist
COPY --from=builder --chown=app:app /app/packages/shared-types/package.json ./node_modules/@meal-rescue/shared-types/package.json
COPY --from=builder --chown=app:app /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder --chown=app:app /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=app:app /app/apps/backend/package.json ./apps/backend/package.json

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/backend/dist/server.js"]
