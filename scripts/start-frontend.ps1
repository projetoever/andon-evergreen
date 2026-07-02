$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$LogsPath = "$ProjectPath\logs"
$FrontUrl = "http://127.0.0.1:8080"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\frontend-start.log" -Value $line
}

function Test-Frontend {
    try {
        Invoke-WebRequest $FrontUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Log "Verificando frontend em $FrontUrl..."

if (Test-Frontend) {
    Write-Log "Frontend ja esta rodando. Nenhuma acao necessaria."
    exit 0
}

$FrontBuild = "$ProjectPath\dist"

if (!(Test-Path $FrontBuild)) {
    Write-Log "ERRO: Build frontend nao encontrado em $FrontBuild"
    Write-Log "Execute: cd C:\web-andon-industrial\andon ; npm.cmd run build"
    exit 1
}

Write-Log "Frontend nao respondeu. Verificando porta 8080..."

$portPids = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    Write-Log "Porta 8080 ocupada por PID $pidItem, mas frontend nao respondeu. Finalizando..."
    Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

Set-Location $ProjectPath

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
$env:NODE_ENV = "production"

$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $NpmCmd) { $NpmCmd = "C:\Program Files\nodejs\npm.cmd" }

if (!(Test-Path $NpmCmd)) {
    Write-Log "ERRO: npm.cmd nao encontrado."
    exit 1
}

Write-Log "Iniciando frontend ANDON na porta 8080..."
& $NpmCmd run preview -- --host 0.0.0.0 --port 8080
