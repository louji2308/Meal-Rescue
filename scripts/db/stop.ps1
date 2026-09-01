# Stops the embedded PostgreSQL used by Meal Rescue.
#
#   npm run db:stop
param()

$ErrorActionPreference = 'Continue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stateDir = Join-Path $root '.local\db'
$pidFile = Join-Path $stateDir 'pid'

if (Test-Path $pidFile) {
    $launcherPid = [int](Get-Content $pidFile)
    try {
        $proc = Get-Process -Id $launcherPid -ErrorAction Stop
        Write-Host "[db] Stopping Postgres launcher (pid $launcherPid)..."
        Stop-Process -Id $launcherPid -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "[db] No live launcher process found."
    }
}

# Fall back to a graceful pg stop via the embedded cluster, if possible.
node (Join-Path $PSScriptRoot 'db.js') stop 2>$null

Remove-Item -Path (Join-Path $stateDir 'ready') -Force -ErrorAction SilentlyContinue
Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "[db] Stopped."
