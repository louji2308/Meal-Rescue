# Meal Rescue — start Postgres + backend only (no Metro). Idempotent.
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host "[standalone] Ensuring embedded PostgreSQL..." -ForegroundColor Cyan
& node (Join-Path $root 'scripts\db/db.js') start

Write-Host "[standalone] Ensuring backend :3010..." -ForegroundColor Cyan
$up = $false
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3010/health' -TimeoutSec 2 -UseBasicParsing
  if ($r.StatusCode -eq 200) { $up = $true }
} catch {}

if (-not $up) {
  Start-Process -FilePath 'npx.cmd' `
    -ArgumentList @('tsx','watch','src/server.ts') `
    -WorkingDirectory (Join-Path $root 'apps/backend') `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3010/health' -TimeoutSec 5 -UseBasicParsing
  Write-Host "[standalone] Backend OK: $($r.Content)" -ForegroundColor Green
} catch {
  Write-Host "[standalone] Backend NOT ready: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "[standalone] Phone APK uses http://10.57.6.237:3010 (LAN) or adb reverse 127.0.0.1:3010" -ForegroundColor Yellow
