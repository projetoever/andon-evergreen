$ErrorActionPreference = "Stop"

$CommonPath = Join-Path $PSScriptRoot "AndonInstaller.Common.ps1"

if (!(Test-Path $CommonPath)) {
    Write-Host "ERRO: biblioteca comum nao encontrada:" -ForegroundColor Red
    Write-Host $CommonPath
    exit 1
}

. $CommonPath

Write-AndonHeader "ANDON - REPARACAO DA INSTALACAO"

if (!(Test-AndonAdmin)) {
    Write-AndonFail "Execute este script como Administrador."
    exit 1
}

if (!(Test-AndonPrerequisites)) {
    Write-AndonFail "Pre-requisitos obrigatorios ausentes. Reparacao cancelada."
    exit 1
}

Write-Host ""
Write-Host "Esta reparacao ira:" -ForegroundColor Cyan
Write-Host "- Parar servicos ANDON;"
Write-Host "- Preservar banco PostgreSQL andon_db;"
Write-Host "- Preservar dados existentes;"
Write-Host "- Reinstalar dependencias;"
Write-Host "- Rodar db:generate e db:migrate;"
Write-Host "- Rebuildar backend e frontend;"
Write-Host "- Recriar tarefas automaticas;"
Write-Host "- Reaplicar firewall;"
Write-Host "- Iniciar servicos;"
Write-Host "- Rodar health check final."
Write-Host ""
Write-AndonWarn "Este script NAO roda db:seed, db:reset, DROP DATABASE ou limpeza de dados."
Write-Host ""

$confirm = Read-Host "Digite REPARAR para continuar"

if ($confirm -ne "REPARAR") {
    Write-AndonWarn "Reparacao cancelada pelo usuario."
    exit 0
}

Write-AndonHeader "1. Validando estrutura do projeto"

if (!(Test-Path $Global:AndonProjectPath)) {
    Write-AndonFail "Projeto nao encontrado em: $Global:AndonProjectPath"
    exit 1
}

if (!(Test-Path (Join-Path $Global:AndonProjectPath ".git"))) {
    Write-AndonFail "Diretorio do projeto existe, mas nao parece ser um repositorio Git valido."
    exit 1
}

$serverPath = Join-Path $Global:AndonProjectPath "server"

if (!(Test-Path $serverPath)) {
    Write-AndonFail "Backend nao encontrado em: $serverPath"
    exit 1
}

Write-AndonOk "Estrutura principal encontrada."

Write-AndonHeader "2. Parando servicos"

Stop-AndonServicesSafe

Write-AndonHeader "3. Sincronizando instalador e ferramentas"

Copy-AndonInstallTools

Write-AndonHeader "4. Garantindo configuracao de rede e .env"

$networkConfig = Ensure-AndonNetworkConfig

if (!$networkConfig) {
    Write-AndonFail "Nao foi possivel obter configuracao de rede."
    exit 1
}

Write-AndonBackendEnv -NetworkConfig $networkConfig -PreserveExisting

Write-AndonOk "Configuracao de rede validada."

Write-AndonHeader "5. Reparando backend"

$npm = Get-AndonNpmCmd

if (!$npm) {
    Write-AndonFail "npm.cmd nao encontrado."
    exit 1
}

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue

if (!(Invoke-AndonCommand "`"$npm`" install --include=dev --no-audit --no-fund" $serverPath "repair.log")) {
    exit 1
}

if (!(Invoke-AndonCommand "`"$npm`" run db:generate" $serverPath "repair.log")) {
    exit 1
}

if (!(Invoke-AndonCommand "`"$npm`" run db:migrate" $serverPath "repair.log")) {
    exit 1
}

if (!(Invoke-AndonCommand "`"$npm`" run build" $serverPath "repair.log")) {
    exit 1
}

Write-AndonOk "Backend reparado."

Write-AndonHeader "6. Reparando frontend"

$env:VITE_ANDON_DATA_MODE = "api"
$env:VITE_ANDON_API_BASE_URL = $networkConfig.apiUrl

if (!(Invoke-AndonCommand "`"$npm`" install --include=dev --no-audit --no-fund" $Global:AndonProjectPath "repair.log")) {
    exit 1
}

if (!(Invoke-AndonCommand "`"$npm`" run build" $Global:AndonProjectPath "repair.log")) {
    exit 1
}

Write-AndonOk "Frontend reparado."

Write-AndonHeader "7. Recriando firewall e tarefas automaticas"

Create-AndonFirewallRules

if (!(Recreate-AndonTasksSafe)) {
    Write-AndonFail "Falha ao recriar tarefas automaticas."
    exit 1
}

Write-AndonOk "Firewall e tarefas automaticas reparados."

Write-AndonHeader "8. Iniciando servicos"

Start-AndonServicesSafe

Write-AndonHeader "9. Health check final"

Invoke-AndonHealthCheck | Out-Null

$apiOk = $false
$dbOk = $false
$frontLocalOk = $false
$frontNetworkOk = $false

try {
    Invoke-RestMethod "http://localhost:3001/health" -TimeoutSec 5 | Out-Null
    $apiOk = $true
} catch {}

try {
    Invoke-RestMethod "http://localhost:3001/health/db" -TimeoutSec 5 | Out-Null
    $dbOk = $true
} catch {}

try {
    Invoke-WebRequest "http://127.0.0.1:8080" -UseBasicParsing -TimeoutSec 5 | Out-Null
    $frontLocalOk = $true
} catch {}

try {
    Invoke-WebRequest $networkConfig.frontendUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
    $frontNetworkOk = $true
} catch {}

if ($apiOk -and $dbOk -and $frontLocalOk -and $frontNetworkOk) {
    Write-AndonOk "Reparacao concluida com health check aprovado."
    exit 0
}

Write-AndonFail "Reparacao finalizada, mas health check reprovou algum item."
Write-Host "API local OK:       $apiOk"
Write-Host "Banco OK:           $dbOk"
Write-Host "Frontend local OK:  $frontLocalOk"
Write-Host "Frontend rede OK:   $frontNetworkOk"
Write-Host "URL rede testada:   $($networkConfig.frontendUrl)"
exit 1

