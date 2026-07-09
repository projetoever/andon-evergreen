$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ScriptsPath = "$ProjectPath\scripts"
$LogsPath = "$ProjectPath\logs"

$ApiHealthUrl = "http://127.0.0.1:3001/health"
$ApiDbHealthUrl = "http://127.0.0.1:3001/health/db"
$MachinesUrl = "http://127.0.0.1:3001/api/machines?includeInactive=true"
$FrontUrl = "http://127.0.0.1:8080"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\watchdog.log" -Value $line
}

function Test-Rest {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-RestMethod $Url -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-Web {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-ApiOperational {
    return ((Test-Rest $ApiHealthUrl) -and (Test-Rest $ApiDbHealthUrl) -and (Test-Rest $MachinesUrl))
}

function Wait-Condition {
    param([scriptblock]$Test, [string]$Label, [int]$TimeoutSeconds = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (& $Test) {
            Write-Log "$Label OK."
            return $true
        }
        Write-Log "$Label ainda nao esta pronto. Aguardando..."
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    Write-Log "ERRO: $Label nao ficou pronto no tempo limite."
    return $false
}

Write-Log "===== WATCHDOG ANDON INICIADO - V10.6.1 ====="

foreach ($taskName in @("ANDON - Boot Servicos", "ANDON - Watchdog Servicos", "ANDON - Chrome Kiosk")) {
    Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
}

Write-Log "Etapa 1/3 - Garantindo banco..."
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ScriptsPath\start-postgres.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Log "ERRO: start-postgres.ps1 falhou. Codigo: $LASTEXITCODE"
    exit 10
}

Write-Log "Etapa 2/3 - Garantindo API operacional..."
if (!(Test-ApiOperational)) {
    Write-Log "API nao operacional. Iniciando..."
    Start-Process powershell.exe `
        -WindowStyle Minimized `
        -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptsPath\start-api.ps1`"" `
        -RedirectStandardOutput "$LogsPath\api-output.log" `
        -RedirectStandardError "$LogsPath\api-error.log"
}

if (!(Wait-Condition -Test { Test-ApiOperational } -Label "API operacional" -TimeoutSeconds 240)) {
    exit 13
}

Write-Log "Etapa 3/3 - Garantindo frontend..."
if (!(Test-Web $FrontUrl)) {
    Write-Log "Frontend nao respondeu. Iniciando..."
    Start-Process powershell.exe `
        -WindowStyle Minimized `
        -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptsPath\start-frontend.ps1`"" `
        -RedirectStandardOutput "$LogsPath\frontend-output.log" `
        -RedirectStandardError "$LogsPath\frontend-error.log"
}

if (!(Wait-Condition -Test { Test-Web $FrontUrl } -Label "Frontend $FrontUrl" -TimeoutSeconds 180)) {
    exit 15
}

Write-Log "===== WATCHDOG ANDON FINALIZADO - V10.6.1 ====="
exit 0
