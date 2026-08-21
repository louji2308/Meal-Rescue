#!/usr/bin/env pwsh
# Meal Rescue - one-time development environment setup (Windows / PowerShell)
#
# Usage:  ./scripts/setup/dev-setup.ps1
# Prereqs: Node.js >= 20, Docker Desktop running for postgres/redis.

$ErrorActionPreference = 'Stop'

Write-Host '==> Installing workspace dependencies' -ForegroundColor Cyan
npm install

Write-Host '==> Starting local infrastructure (postgres + redis)' -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host '==> Waiting for postgres to be healthy' -ForegroundColor Cyan
$maxAttempts = 30
for ($i = 1; $i -le $maxAttempts; $i++) {
  $status = docker inspect --format '{{.State.Health.Status}}' meal-rescue-postgres 2>$null
  if ($status -eq 'healthy') { break }
  if ($i -eq $maxAttempts) { throw 'Postgres did not become healthy in time' }
  Start-Sleep -Seconds 1
}

if (-not (Test-Path 'apps/backend/.env')) {
  Write-Host '==> Creating apps/backend/.env from template' -ForegroundColor Cyan
  Copy-Item apps/backend/.env.example apps/backend/.env
}

if (-not (Test-Path 'apps/mobile/.env')) {
  Write-Host '==> Creating apps/mobile/.env from template' -ForegroundColor Cyan
  Copy-Item apps/mobile/.env.example apps/mobile/.env
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host '  Backend : npm run dev --workspace @meal-rescue/backend   (http://localhost:3000, docs at /docs)'
Write-Host '  Mobile  : npm run dev --workspace @meal-rescue/mobile'
Write-Host '  Tests   : npm test'
