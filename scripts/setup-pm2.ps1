# Figmento — One-command pm2 setup for Windows
#
# What this does:
#   1. Installs pm2 globally (if not already installed)
#   2. Builds figmento-ws-relay
#   3. Starts the relay under pm2 as "figmento-relay"
#   4. Saves the pm2 process list (for auto-restore)
#   5. Registers a Windows Task Scheduler task to run pm2 resurrect at login
#
# After this runs once, the relay:
#   - Auto-starts on every Windows login
#   - Auto-restarts if it crashes
#   - Auto-restarts when you run `npm run build` in figmento-ws-relay (postbuild hook)
#
# Usage:
#   From the Figmento repo root:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-pm2.ps1
#
# To undo everything:
#   pm2 delete figmento-relay
#   pm2 kill
#   Unregister-ScheduledTask -TaskName 'Figmento Relay (pm2)' -Confirm:$false

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$RelayDir = Join-Path $RepoRoot 'figmento-ws-relay'
$RelayEntry = Join-Path $RelayDir 'dist\index.js'

Write-Host "Figmento pm2 setup" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot"
Write-Host ""

# ── 1. Verify Node.js + npm present ──────────────────────────────────────────
try {
    $nodeVer = node --version
    $npmVer = npm --version
    Write-Host "[OK] Node $nodeVer, npm $npmVer" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Node.js not found. Install from https://nodejs.org first." -ForegroundColor Red
    exit 1
}

# ── 2. Install pm2 globally ──────────────────────────────────────────────────
$pm2Installed = $false
try {
    $pm2Ver = pm2 --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pm2Installed = $true
        Write-Host "[OK] pm2 already installed (v$pm2Ver)" -ForegroundColor Green
    }
} catch { }

if (-not $pm2Installed) {
    Write-Host "[..] Installing pm2 globally..."
    npm install -g pm2
    Write-Host "[OK] pm2 installed" -ForegroundColor Green
}

# ── 3. Build the relay ───────────────────────────────────────────────────────
if (-not (Test-Path $RelayEntry)) {
    Write-Host "[..] Building figmento-ws-relay..."
    Push-Location $RelayDir
    try { npm install; npm run build } finally { Pop-Location }
    Write-Host "[OK] Relay built" -ForegroundColor Green
} else {
    Write-Host "[OK] Relay already built ($RelayEntry)" -ForegroundColor Green
}

# ── 4. Stop any existing figmento-relay before re-registering ────────────────
pm2 delete figmento-relay 2>$null | Out-Null

# ── 5. Start under pm2 ───────────────────────────────────────────────────────
Write-Host "[..] Starting relay under pm2..."
pm2 start $RelayEntry --name figmento-relay | Out-Null

# Give it a moment to bind to port 3055
Start-Sleep -Seconds 2

$status = pm2 jlist 2>$null | ConvertFrom-Json
$relay = $status | Where-Object { $_.name -eq 'figmento-relay' }
if ($relay -and $relay.pm2_env.status -eq 'online') {
    Write-Host "[OK] Relay online (pid $($relay.pid), $([math]::Round($relay.monit.memory / 1MB, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Relay did not come online. Check 'pm2 logs figmento-relay'." -ForegroundColor Red
    exit 1
}

# ── 6. Save pm2 state so resurrect can restore it ────────────────────────────
pm2 save | Out-Null
Write-Host "[OK] pm2 state saved" -ForegroundColor Green

# ── 7. Register Task Scheduler task for auto-start on login ──────────────────
$pm2Cmd = (Get-Command pm2.cmd -ErrorAction SilentlyContinue).Source
if (-not $pm2Cmd) { $pm2Cmd = "$env:APPDATA\npm\pm2.cmd" }
if (-not (Test-Path $pm2Cmd)) {
    Write-Host "[FAIL] Could not find pm2.cmd. Task Scheduler step skipped." -ForegroundColor Yellow
    exit 0
}

$TaskName = 'Figmento Relay (pm2)'
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\cmd.exe' -Argument "/c `"$pm2Cmd`" resurrect"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Auto-start pm2 on login (manages figmento-ws-relay)' -Force | Out-Null
Write-Host "[OK] Task Scheduler task registered: $TaskName" -ForegroundColor Green

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Cyan
Write-Host ""
Write-Host "What happens now:"
Write-Host "  - Relay is running in the background (port 3055)"
Write-Host "  - Auto-starts on every Windows login"
Write-Host "  - Auto-restarts if it crashes"
Write-Host "  - 'npm run build' in figmento-ws-relay auto-restarts it"
Write-Host ""
Write-Host "Handy commands:"
Write-Host "  pm2 status                       See if relay is running"
Write-Host "  pm2 logs figmento-relay          Watch relay logs live"
Write-Host "  pm2 restart figmento-relay       Restart after code changes"
Write-Host "  pm2 stop figmento-relay          Stop the relay"
Write-Host ""
Write-Host "Open Figma + Figmento plugin now — it should auto-connect."
