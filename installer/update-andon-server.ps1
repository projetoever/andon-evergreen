$ErrorActionPreference = "Stop"

$CommonScript = "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

if (!(Test-Path $CommonScript)) {
    Write-Host "ERRO: biblioteca comum nao encontrada em $CommonScript" -ForegroundColor Red
    exit 1
}

. $CommonScript

Write-AndonHeader "ANDON - ATUALIZACAO SEGURA PELA MAIN"

Assert-AndonAdmin

if (!(Test-AndonPrerequisites)) {
    Write-AndonFail "Atualizacao interrompida por falta de pre-requisitos."
    exit 1
}

if (!(Test-Path $Global:AndonProjectPath)) {
    Write-AndonFail "Projeto nao encontrado em: $Global:AndonProjectPath"
    Write-AndonFail "Execute primeiro a instalacao limpa."
    exit 1
}

if (!(Test-Path "$Global:AndonProjectPath\.git")) {
    Write-AndonFail "A pasta do projeto existe, mas nao parece ser um repositorio Git."
    exit 1
}

Write-Host ""
Write-Host "Esta atualizacao ira:" -ForegroundColor Yellow
Write-Host "- Parar o ANDON;"
Write-Host "- Atualizar o codigo pela branch main;"
Write-Host "- Instalar dependencias;"
Write-Host "- Rodar db:generate;"
Write-Host "- Rodar db:migrate;"
Write-Host "- Buildar backend;"
Write-Host "- Buildar frontend;"
Write-Host "- Copiar install-tools, se existir;"
Write-Host "- Recriar tarefas;"
Write-Host "- Iniciar servicos;"
Write-Host "- Rodar health check final."
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Red
Write-Host "- Este script NAO roda db:seed;"
Write-Host "- Este script NAO roda db:reset;"
Write-Host "- Este script preserva o banco $Global:AndonDatabaseName."
Write-Host ""

$confirm = Read-Host "Digite ATUALIZAR para continuar"

if ($confirm -ne "ATUALIZAR") {
    Write-AndonWarn "Atualizacao cancelada pelo usuario."
    exit 0
}

Initialize-AndonFolders

Write-AndonHeader "1. Backup recomendado antes da atualizacao"

$backupScript = "$Global:AndonToolsPath\backup-andon.ps1"
$legacyBackupScript = "$Global:AndonToolsPath\10-backup-andon.ps1"

if (Test-Path $backupScript) {
    Write-AndonOk "Executando backup antes da atualizacao."
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File $backupScript
} elseif (Test-Path $legacyBackupScript) {
    Write-AndonOk "Executando backup antes da atualizacao."
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File $legacyBackupScript
} else {
    Write-AndonWarn "Script de backup nao encontrado em $Global:AndonToolsPath."
    Write-AndonWarn "Continuando sem backup automatico. Verifique se ha backup manual, se for ambiente com dados reais."
}

Write-AndonHeader "2. Parando servicos"
Stop-AndonServicesSafe

Write-AndonHeader "3. Atualizando repositorio pela main"

if (!(Invoke-AndonCommand -Command "git fetch --all --prune" -WorkingDirectory $Global:AndonProjectPath -LogName "update.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "git checkout $Global:AndonBranch" -WorkingDirectory $Global:AndonProjectPath -LogName "update.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "git pull --ff-only origin $Global:AndonBranch" -WorkingDirectory $Global:AndonProjectPath -LogName "update.log")) {
    Write-AndonFail "Falha no git pull --ff-only. Pode haver alteracoes locais ou conflito."
    Write-AndonFail "Resolva manualmente antes de atualizar."
    exit 1
}

Write-AndonHeader "4. Copiando install-tools atualizado"
Copy-AndonInstallTools | Out-Null

Write-AndonHeader "5. Garantindo configuracao de rede e .env do backend"

$networkConfig = Ensure-AndonNetworkConfig

$ServerPath = "$Global:AndonProjectPath\server"

if (!(Write-AndonBackendEnv -PreserveExisting)) {
    Write-AndonFail "Falha ao garantir .env do backend."
    exit 1
}

Write-AndonHeader "6. Atualizando backend"

$npmCmd = Get-AndonNpmCmd

if (!$npmCmd) {
    Write-AndonFail "npm.cmd nao encontrado."
    exit 1
}

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" install --include=dev --no-audit --no-fund" -WorkingDirectory $ServerPath -LogName "update.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run db:generate" -WorkingDirectory $ServerPath -LogName "update.log")) {
    exit 1
}

Write-AndonHeader "7. Rodando migracoes sem seed"

Write-AndonWarn "Atualizacao segura: db:migrate sera executado, mas db:seed NAO sera executado."

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run db:migrate" -WorkingDirectory $ServerPath -LogName "update.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run build" -WorkingDirectory $ServerPath -LogName "update.log")) {
    exit 1
}

Write-AndonOk "Backend atualizado e buildado."

Write-AndonHeader "8. Atualizando frontend"

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
$env:VITE_ANDON_DATA_MODE = "api"
$networkConfig = Ensure-AndonNetworkConfig
$env:VITE_ANDON_API_BASE_URL = $networkConfig.apiUrl

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" install --include=dev --no-audit --no-fund" -WorkingDirectory $Global:AndonProjectPath -LogName "update.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run build" -WorkingDirectory $Global:AndonProjectPath -LogName "update.log")) {
    exit 1
}

Remove-Item Env:\VITE_ANDON_DATA_MODE -ErrorAction SilentlyContinue
Remove-Item Env:\VITE_ANDON_API_BASE_URL -ErrorAction SilentlyContinue

Write-AndonOk "Frontend atualizado e buildado."

Write-AndonHeader "9. Recriando firewall"
Create-AndonFirewallRules

Write-AndonHeader "10. Recriando tarefas automaticas"
Recreate-AndonTasksSafe

Write-AndonHeader "11. Iniciando servicos"
Start-AndonServicesSafe

Write-AndonHeader "12. Health check final"

Start-Sleep -Seconds 10

Invoke-AndonHealthCheck | Out-Null

$apiOk = $false
$dbOk = $false
$frontOk = $false

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
    $frontOk = $true
} catch {}

$networkConfig = Get-AndonNetworkConfig
$frontNetworkOk = $true

if ($networkConfig -and $networkConfig.frontendUrl) {
    $frontNetworkOk = $false
    try {
        Invoke-WebRequest $networkConfig.frontendUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
        $frontNetworkOk = $true
    } catch {}
}

if ($apiOk -and $dbOk -and $frontOk -and $frontNetworkOk) {
    Write-AndonOk "Atualizacao concluida com health check final aprovado."
} else {
    Write-AndonFail "Health check final reprovado."
    Write-Host "API OK: $apiOk"
    Write-Host "Banco OK: $dbOk"
    Write-Host "Frontend localhost OK: $frontOk"
    Write-Host "Frontend rede OK: $frontNetworkOk"
    exit 1
}

Write-AndonHeader "ANDON - ATUALIZACAO FINALIZADA"

Write-Host "Acesso local:" -ForegroundColor Green
Write-Host "http://localhost:$Global:AndonFrontendPort"
Write-Host ""
Write-Host "API:" -ForegroundColor Green
Write-Host "http://localhost:$Global:AndonApiPort"
Write-Host ""

exit 0



