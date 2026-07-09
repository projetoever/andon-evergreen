$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$LogsPath = "$ProjectPath\logs"
$FrontUrl = "http://127.0.0.1:8080"
$HealthUrl = "http://127.0.0.1:3001/health"
$DbHealthUrl = "http://127.0.0.1:3001/health/db"
$MachinesUrl = "http://127.0.0.1:3001/api/machines?includeInactive=true"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\frontend-start.log" -Value $line
}

function Test-Web {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-Rest {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-RestMethod $Url -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-ApiOperational {
    return ((Test-Rest $HealthUrl) -and (Test-Rest $DbHealthUrl) -and (Test-Rest $MachinesUrl))
}

function Wait-ApiOperational {
    param([int]$TimeoutSeconds = 240)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-ApiOperational) { return $true }
        Write-Log "API ainda nao operacional. Aguardando..."
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    return $false
}

Write-Log "===== FRONTEND ANDON - START V10.6.1 ====="

if (!(Wait-ApiOperational -TimeoutSeconds 240)) {
    Write-Log "ERRO: API nao ficou operacional. Frontend nao sera iniciado."
    exit 1
}

if (Test-Web $FrontUrl) {
    Write-Log "Frontend ja esta rodando. Nenhuma acao necessaria."
    exit 0
}

$FrontBuild = "$ProjectPath\dist"
if (!(Test-Path $FrontBuild)) {
    Write-Log "ERRO: Build frontend nao encontrado em $FrontBuild"
    exit 2
}

$portPids = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    Write-Log "Porta 8080 ocupada por PID $pidItem, mas frontend nao respondeu. Finalizando..."
    Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

Set-Location $ProjectPath
$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NpmCmd) { $NpmCmd = "C:\Program Files\nodejs\npm.cmd" }
if (!(Test-Path $NpmCmd)) {
    Write-Log "ERRO: npm.cmd nao encontrado."
    exit 3
}

$env:NODE_ENV = "production"
Write-Log "Iniciando frontend ANDON na porta 8080..."
& $NpmCmd run preview -- --host 0.0.0.0 --port 8080
