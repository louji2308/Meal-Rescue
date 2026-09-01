# Starter for the embedded PostgreSQL used by Meal Rescue (no Docker needed).
# Starts the DB node process as an independent background process and waits
# until it is ready to accept connections.
#
#   npm run db:start
param()

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stateDir = Join-Path $root '.local\db'
$readyFile = Join-Path $stateDir 'ready'
$pidFile = Join-Path $stateDir 'pid'
$outLog = Join-Path $stateDir 'start.stdout.log'
$errLog = Join-Path $stateDir 'start.stderr.log'
$dbJs = Join-Path $PSScriptRoot 'db.js'

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Test-Alive([int]$processId) {
    try { Get-Process -Id $processId -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

# Refresh stale ready state so a prior crash doesn't fool us.
if (Test-Path $readyFile) { Remove-Item $readyFile -Force }

# If an existing launcher is alive AND the DB is up, just report success.
if (Test-Path $pidFile) {
    $existing = [int](Get-Content $pidFile)
    if ((Test-Alive $existing) -and (Test-Path $readyFile)) {
        Write-Host "[db] Already running (pid $existing)."
        exit 0
    }
}

Write-Host "[db] Starting PostgreSQL in the background..."
$proc = Start-Process -FilePath 'node' `
    -ArgumentList @('"' + $dbJs + '"', 'start') `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

Set-Content -Path $pidFile -Value $proc.Id

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    if (Test-Path $readyFile) {
        Write-Host "[db] PostgreSQL is up (pid $($proc.Id))."
        exit 0
    }
    if (-not (Test-Alive $proc.Id)) {
        Write-Host "[db] Postgres process exited early. See $errLog" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Milliseconds 500
}

Write-Host "[db] Timed out waiting for PostgreSQL to be ready. See $errLog" -ForegroundColor Red
exit 1
