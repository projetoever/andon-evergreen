$ErrorActionPreference = "Stop"

$CommonPath = Join-Path $PSScriptRoot "AndonInstaller.Common.ps1"

if (!(Test-Path $CommonPath)) {
    Write-Host "ERRO: biblioteca comum nao encontrada:" -ForegroundColor Red
    Write-Host $CommonPath
    exit 1
}

. $CommonPath

Write-AndonHeader "ANDON - DESINSTALACAO LIMPA"

Assert-AndonAdmin

$config = Ensure-AndonInstallConfig

Write-Host ""
Write-Host "ATENCAO: esta opcao remove o ANDON e tambem apaga banco/usuario PostgreSQL." -ForegroundColor Red
Write-Host ""
Write-Host "Sera removido:"
Write-Host "- Tarefas automaticas ANDON"
Write-Host "- Regras de firewall ANDON"
Write-Host "- Pasta do app: $Global:AndonProjectPath"
Write-Host "- Banco PostgreSQL: $($config.databaseName)"
Write-Host "- Usuario PostgreSQL: $($config.databaseUser)"
Write-Host "- Configuracao global: $Global:AndonConfigPath"
Write-Host ""
Write-Host "PostgreSQL configurado:" -ForegroundColor Yellow
Write-Host "$($config.postgresHost):$($config.postgresPort)"
Write-Host ""

$confirm = Read-Host "Digite APAGAR para continuar"

if ($confirm -ne "APAGAR") {
    Write-AndonWarn "Desinstalacao limpa cancelada."
    exit 0
}

Write-Host ""
Write-Host "Informe a senha do usuario postgres do PostgreSQL." -ForegroundColor Yellow
Write-Host "ATENCAO: esta senha e do PostgreSQL, nao e a senha do Windows." -ForegroundColor Yellow
Write-Host ""

$postgresAdminPassword = Read-Host "Senha do usuario postgres"

if (!(Test-AndonPostgresAdminConnection -PostgresPassword $postgresAdminPassword -PostgresPort $config.postgresPort)) {
    Write-AndonFail "Nao foi possivel validar acesso administrativo ao PostgreSQL."
    exit 1
}

Write-AndonHeader "1. Parando servicos/processos"
Stop-AndonServicesSafe

Write-AndonHeader "2. Removendo tarefas automaticas"

foreach ($taskName in @(
    "ANDON - Inicializacao Automatica",
    $Global:AndonTaskBoot,
    $Global:AndonTaskWatchdog,
    $Global:AndonTaskKiosk
)) {
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null
    Write-Host "Tarefa removida/se inexistente: $taskName"
}

Write-AndonHeader "3. Removendo regras de firewall"

Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-AndonOk "Regras de firewall removidas/se inexistentes."

Write-AndonHeader "4. Removendo banco e usuario PostgreSQL"

$psql = Get-AndonPsql

if (!$psql) {
    Write-AndonFail "psql.exe nao encontrado. Nao foi possivel remover banco."
    exit 1
}

$dbSql = @"
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$($config.databaseName)';
DROP DATABASE IF EXISTS $($config.databaseName);
DROP USER IF EXISTS $($config.databaseUser);
"@

$tempSqlPath = "$Global:AndonInstallerPath\uninstall-clean-database.sql"
$dbSql | Set-Content -Path $tempSqlPath -Encoding UTF8

$oldPgPassword = $env:PGPASSWORD
$env:PGPASSWORD = $postgresAdminPassword

try {
    & $psql `
        -h $config.postgresHost `
        -p $config.postgresPort `
        -U postgres `
        -d postgres `
        -f $tempSqlPath

    if ($LASTEXITCODE -ne 0) {
        Write-AndonFail "Falha ao remover banco/usuario PostgreSQL."
        exit 1
    }
} finally {
    $env:PGPASSWORD = $oldPgPassword
}

Write-AndonOk "Banco/usuario removidos ou inexistentes."

Write-AndonHeader "5. Removendo pasta do app"

if (Test-Path $Global:AndonProjectPath) {
    Remove-Item -Recurse -Force $Global:AndonProjectPath
    Write-AndonOk "Pasta removida: $Global:AndonProjectPath"
} else {
    Write-AndonWarn "Pasta do app nao encontrada: $Global:AndonProjectPath"
}

Write-AndonHeader "6. Removendo configuracao global"

if (Test-Path $Global:AndonConfigPath) {
    Remove-Item -Force $Global:AndonConfigPath
    Write-AndonOk "Configuracao global removida: $Global:AndonConfigPath"
} else {
    Write-AndonWarn "Configuracao global nao encontrada: $Global:AndonConfigPath"
}

Write-AndonHeader "DESINSTALACAO LIMPA FINALIZADA"

Write-Host "Para reinstalar do zero, execute novamente o bootstrap/instalador." -ForegroundColor Green
Write-Host ""

exit 0
