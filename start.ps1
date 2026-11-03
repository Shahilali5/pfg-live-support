# ==============================================================================
# PFG Live Support - Windows PowerShell Launcher
# Prompts for port, terminates any conflicting process, and starts server
# ==============================================================================

Write-Host "====================================================================" -ForegroundColor Magenta
Write-Host "       PFG Live Support - Real-Time Customer Chat Platform" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Magenta

# Determine default port from .env or fallback to 3000
$defaultPort = "3000"
if (Test-Path ".env") {
    $envLines = Get-Content ".env"
    foreach ($line in $envLines) {
        if ($line -match "^PORT=(.*)") {
            $defaultPort = $matches[1].Trim()
        }
    }
}

# Ask user for port
Write-Host ""
$inputPort = Read-Host "Enter port to run PFG Live Support [Press Enter for default: $defaultPort]"
if ([string]::IsNullOrWhiteSpace($inputPort)) {
    $targetPort = [int]$defaultPort
} else {
    $targetPort = [int]$inputPort.Trim()
}

Write-Host "`n[INFO] Checking if port $targetPort is currently occupied..." -ForegroundColor Yellow

# Kill any existing process on this port
try {
    $connections = Get-NetTCPConnection -LocalPort $targetPort -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -gt 0 -and $procId -ne $PID) {
                Write-Host "[WARNING] Port $targetPort is in use by PID $procId. Terminating old process..." -ForegroundColor Red
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Seconds 1
    }
    Write-Host "[SUCCESS] Port $targetPort is free and ready." -ForegroundColor Green
} catch {
    Write-Host "[INFO] Port check completed." -ForegroundColor Gray
}

# Set environment variable and update .env
$env:PORT = "$targetPort"
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "PORT=\d+") {
        $envContent = $envContent -replace "PORT=\d+", "PORT=$targetPort"
    } else {
        $envContent += "`nPORT=$targetPort"
    }
    Set-Content -Path ".env" -Value $envContent -NoNewline
}

Write-Host "`n[INFO] Starting PFG Live Support on http://localhost:$targetPort..." -ForegroundColor Cyan
Write-Host "  💬 Demo Portal:   http://localhost:$targetPort/" -ForegroundColor Gray
Write-Host "  🛡️  Admin Console: http://localhost:$targetPort/admin" -ForegroundColor Gray
Write-Host "  📚 API Docs:      http://localhost:$targetPort/docs`n" -ForegroundColor Gray

node server/server.js
