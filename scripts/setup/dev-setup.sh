#!/usr/bin/env bash
# Meal Rescue - one-time development environment setup (macOS / Linux)
#
# Usage:  ./scripts/setup/dev-setup.sh
# Prereqs: Node.js >= 20, Docker running for postgres/redis.

set -euo pipefail

echo "==> Installing workspace dependencies"
npm install

echo "==> Starting local infrastructure (postgres + redis)"
docker compose up -d postgres redis

echo "==> Waiting for postgres to be healthy"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' meal-rescue-postgres 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  if [ "$i" -eq 30 ]; then echo "Postgres did not become healthy in time" >&2; exit 1; fi
  sleep 1
done

[ -f apps/backend/.env ] || cp apps/backend/.env.example apps/backend/.env
[ -f apps/mobile/.env ] || cp apps/mobile/.env.example apps/mobile/.env

echo ""
echo "Setup complete."
echo "  Backend : npm run dev --workspace @meal-rescue/backend   (http://localhost:3000, docs at /docs)"
echo "  Mobile  : npm run dev --workspace @meal-rescue/mobile"
echo "  Tests   : npm test"
