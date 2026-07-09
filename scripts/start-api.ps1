$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ServerPath = "$ProjectPath\server"
$ScriptsPath = "$ProjectPath\scripts"
$LogsPath = "$ProjectPath\logs"
$HealthUrl = "http://127.0.0.1:3001/health"
$DbHealthUrl = "http://127.0.0.1:3001/health/db"
$MachinesUrl = "http://127.0.0.1:3001/api/machines?includeInactive=true"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\api-start.log" -Value $line
}

function Test-Rest {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-RestMethod $Url -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-ApiOperational {
    return ((Test-Rest $HealthUrl) -and (Test-Rest $DbHealthUrl) -and (Test-Rest $MachinesUrl))
}

Write-Log "===== API ANDON - START V10.6.1 ====="

if (Test-Path "$ScriptsPath\start-postgres.ps1") {
    Write-Log "Garantindo banco antes da API..."
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ScriptsPath\start-postgres.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO: banco nao ficou pronto. Codigo: $LASTEXITCODE"
        exit 1
    }
}

if (Test-ApiOperational) {
    Write-Log "API ja esta operacional. Nenhuma acao necessaria."
    exit 0
}

$ApiBuild = "$ServerPath\dist\server.js"
if (!(Test-Path $ApiBuild)) {
    Write-Log "ERRO: Build da API nao encontrado em $ApiBuild"
    exit 2
}

$portPids = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    Write-Log "Porta 3001 ocupada por PID $pidItem, mas API nao respondeu corretamente. Finalizando..."
    Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

Set-Location $ServerPath
$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NpmCmd) { $NpmCmd = "C:\Program Files\nodejs\npm.cmd" }
if (!(Test-Path $NpmCmd)) {
    Write-Log "ERRO: npm.cmd nao encontrado."
    exit 3
}

$env:NODE_ENV = "production"
Write-Log "Iniciando API ANDON..."
& $NpmCmd run start
