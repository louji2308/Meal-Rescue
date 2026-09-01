# Meal Rescue - one-command dev environment (DB + backend + Metro)
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')

Write-Host "[dev] Starting embedded PostgreSQL..." -ForegroundColor Cyan
& node (Join-Path $root 'scripts\db\db.js') start
if ($LASTEXITCODE -ne 0) { Write-Host "[dev] DB failed to start" -ForegroundColor Red; exit 1 }

Write-Host "[dev] Starting backend (:3010) and Metro (:8081)..." -ForegroundColor Cyan
$backendProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'dev', '--workspace', '@meal-rescue/backend') `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru

$mobileDir = Join-Path $root 'apps\mobile'
$metroProc = Start-Process -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'start') `
    -WorkingDirectory $mobileDir -WindowStyle Hidden -PassThru

function Stop-Tree([int]$pid) {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $pid } |
        ForEach-Object { Stop-Tree $_.ProcessId }
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

try {
    Write-Host ""
    Write-Host "[dev] All services launched." -ForegroundColor Green
    Write-Host "  - Backend: http://localhost:3010/docs" -ForegroundColor Green
    Write-Host "  - Metro:   http://localhost:8081" -ForegroundColor Green
    Write-Host ""
    Write-Host "  On the emulator: adb reverse tcp:8081 tcp:8081 then open exp://127.0.0.1:8081" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
    Write-Host ""

    while ($true) {
        Start-Sleep -Seconds 2
        if ($backendProc.HasExited) { Write-Host "[dev] Backend process exited." -ForegroundColor Red; break }
        if ($metroProc.HasExited)   { Write-Host "[dev] Metro process exited." -ForegroundColor Red; break }
    }
}
finally {
    Write-Host "[dev] Stopping services..." -ForegroundColor Cyan
    Stop-Tree $backendProc.Id
    Stop-Tree $metroProc.Id
    & node (Join-Path $root 'scripts\db\db.js') stop
    Write-Host "[dev] Stopped." -ForegroundColor Cyan
}
