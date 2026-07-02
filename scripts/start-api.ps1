$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ServerPath = "$ProjectPath\server"
$LogsPath = "$ProjectPath\logs"
$HealthUrl = "http://localhost:3001/health"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\api-start.log" -Value $line
}

function Test-Api {
    try {
        Invoke-RestMethod $HealthUrl -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Log "Verificando API em $HealthUrl..."

if (Test-Api) {
    Write-Log "API ja esta rodando. Nenhuma acao necessaria."
    exit 0
}

$ApiBuild = "$ServerPath\dist\server.js"

if (!(Test-Path $ApiBuild)) {
    Write-Log "ERRO: Build da API nao encontrado em $ApiBuild"
    Write-Log "Execute: cd C:\web-andon-industrial\andon\server ; npm.cmd run build"
    exit 1
}

Write-Log "API nao respondeu. Verificando porta 3001..."

$portPids = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    Write-Log "Porta 3001 ocupada por PID $pidItem, mas API nao respondeu. Finalizando..."
    Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

Set-Location $ServerPath

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
$env:NODE_ENV = "production"

$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NpmCmd) { $NpmCmd = "C:\Program Files\nodejs\npm.cmd" }

if (!(Test-Path $NpmCmd)) {
    Write-Log "ERRO: npm.cmd nao encontrado."
    exit 1
}

Write-Log "Iniciando API ANDON..."
& $NpmCmd run start
