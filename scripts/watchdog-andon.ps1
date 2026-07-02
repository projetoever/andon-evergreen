$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ScriptsPath = "$ProjectPath\scripts"
$LogsPath = "$ProjectPath\logs"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\watchdog.log" -Value $line
}

function Test-Http {
    param([string]$Url)
    try {
        Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Log "===== WATCHDOG ANDON INICIADO ====="

Write-Log "Verificando PostgreSQL..."

if (Test-Path "$ScriptsPath\start-postgres.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ScriptsPath\start-postgres.ps1"
} else {
    Write-Log "ERRO: start-postgres.ps1 nao encontrado."
}

Start-Sleep -Seconds 5

if (Test-Http "http://localhost:3001/health") {
    Write-Log "API OK em http://localhost:3001/health"
} else {
    Write-Log "API nao respondeu. Tentando iniciar..."

    if (Test-Path "$ScriptsPath\start-api.ps1") {
        Start-Process powershell.exe `
            -WindowStyle Minimized `
            -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptsPath\start-api.ps1`"" `
            -RedirectStandardOutput "$LogsPath\api-output.log" `
            -RedirectStandardError "$LogsPath\api-error.log"
    } else {
        Write-Log "ERRO: start-api.ps1 nao encontrado."
    }
}

Start-Sleep -Seconds 10

if (Test-Http "http://127.0.0.1:8080") {
    Write-Log "Frontend OK em http://127.0.0.1:8080"
} else {
    Write-Log "Frontend nao respondeu. Tentando iniciar..."

    if (Test-Path "$ScriptsPath\start-frontend.ps1") {
        Start-Process powershell.exe `
            -WindowStyle Minimized `
            -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptsPath\start-frontend.ps1`"" `
            -RedirectStandardOutput "$LogsPath\frontend-output.log" `
            -RedirectStandardError "$LogsPath\frontend-error.log"
    } else {
        Write-Log "ERRO: start-frontend.ps1 nao encontrado."
    }
}

Write-Log "===== WATCHDOG ANDON FINALIZADO ====="
