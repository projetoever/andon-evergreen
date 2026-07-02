$ErrorActionPreference = "Stop"

$CommonScript = "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

if (!(Test-Path $CommonScript)) {
    Write-Host "ERRO: biblioteca comum nao encontrada em $CommonScript" -ForegroundColor Red
    exit 1
}

. $CommonScript

Write-AndonHeader "ANDON - INSTALACAO LIMPA DO SERVIDOR WINDOWS"

Assert-AndonAdmin

if (!(Test-AndonPrerequisites)) {
    Write-AndonFail "Instalacao interrompida por falta de pre-requisitos."
    exit 1
}

Write-Host ""
Write-Host "Esta instalacao limpa ira preparar o servidor ANDON em:" -ForegroundColor Yellow
Write-Host $Global:AndonBasePath
Write-Host ""
Write-Host "Ela ira:" -ForegroundColor Yellow
Write-Host "- Usar branch main"
Write-Host "- Criar/usar PostgreSQL local"
Write-Host "- Criar usuario $Global:AndonDatabaseUser com CREATEDB"
Write-Host "- Criar banco $Global:AndonDatabaseName"
Write-Host "- Rodar db:migrate"
Write-Host "- Rodar db:seed"
Write-Host "- Buildar backend e frontend"
Write-Host "- Criar firewall"
Write-Host "- Criar tarefas automaticas"
Write-Host "- Iniciar servicos"
Write-Host "- Rodar health check final"
Write-Host ""

$confirm = Read-Host "Digite INSTALAR para continuar"

if ($confirm -ne "INSTALAR") {
    Write-AndonWarn "Instalacao cancelada pelo usuario."
    exit 0
}

Initialize-AndonFolders

Write-AndonHeader "1. Parando servicos existentes"
Stop-AndonServicesSafe

Write-AndonHeader "2. Preparando pasta base"
New-Item -ItemType Directory -Force $Global:AndonBasePath | Out-Null

if (Test-Path $Global:AndonProjectPath) {
    Write-AndonWarn "Pasta do projeto ja existe: $Global:AndonProjectPath"
    Write-AndonWarn "A instalacao limpa ira atualizar a branch main sem apagar a pasta diretamente."
} else {
    Write-AndonOk "Pasta do projeto ainda nao existe. Sera clonada."
}

Write-AndonHeader "3. Clonando ou atualizando repositorio"

if (!(Test-Path $Global:AndonProjectPath)) {
    $cloneCommand = "git clone $Global:AndonRepoUrl `"$Global:AndonProjectPath`""
    if (!(Invoke-AndonCommand -Command $cloneCommand -WorkingDirectory $Global:AndonBasePath -LogName "install.log")) {
        Write-AndonFail "Falha ao clonar repositorio."
        exit 1
    }
} else {
    if (!(Test-Path "$Global:AndonProjectPath\.git")) {
        Write-AndonFail "A pasta $Global:AndonProjectPath existe, mas nao parece ser um repositorio Git."
        Write-AndonFail "Para instalacao limpa real, remova ou renomeie esta pasta antes de continuar."
        exit 1
    }
}

if (!(Invoke-AndonCommand -Command "git fetch --all --prune" -WorkingDirectory $Global:AndonProjectPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "git checkout $Global:AndonBranch" -WorkingDirectory $Global:AndonProjectPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "git pull --ff-only origin $Global:AndonBranch" -WorkingDirectory $Global:AndonProjectPath -LogName "install.log")) {
    exit 1
}

Write-AndonHeader "4. Criando pastas internas"
New-Item -ItemType Directory -Force $Global:AndonLogsPath | Out-Null
New-Item -ItemType Directory -Force $Global:AndonBackupsPath | Out-Null
New-Item -ItemType Directory -Force $Global:AndonChromeProfilePath | Out-Null
New-Item -ItemType Directory -Force "$Global:AndonProjectPath\scripts" | Out-Null

Write-AndonOk "Pastas internas criadas."

Write-AndonHeader "5. Copiando install-tools"
Copy-AndonInstallTools | Out-Null

Write-AndonHeader "6. Configurando rede e .env do backend"

$networkConfig = Select-AndonServerIp

$ServerPath = "$Global:AndonProjectPath\server"
$EnvPath = "$ServerPath\.env"

if (!(Write-AndonBackendEnv)) {
    Write-AndonFail "Falha ao criar .env do backend."
    exit 1
}

Write-AndonHeader "7. Preparando PostgreSQL"

$psql = Get-AndonPsql

if (!$psql) {
    Write-AndonFail "psql.exe nao encontrado. Nao e possivel preparar o banco."
    exit 1
}

Write-Host ""
Write-Host "Sera necessario informar a senha do usuario postgres, se o PostgreSQL solicitar." -ForegroundColor Yellow
Write-Host ""

$dbSql = @"
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Global:AndonDatabaseName';
DROP DATABASE IF EXISTS $Global:AndonDatabaseName;
DROP USER IF EXISTS $Global:AndonDatabaseUser;
CREATE USER $Global:AndonDatabaseUser WITH PASSWORD '$Global:AndonDatabasePassword' CREATEDB;
CREATE DATABASE $Global:AndonDatabaseName OWNER $Global:AndonDatabaseUser;
GRANT ALL PRIVILEGES ON DATABASE $Global:AndonDatabaseName TO $Global:AndonDatabaseUser;
"@

$tempSqlPath = "$Global:AndonInstallerPath\prepare-database.sql"
$dbSql | Set-Content -Path $tempSqlPath -Encoding UTF8

& $psql -h localhost -p $Global:AndonPostgresPort -U postgres -d postgres -f $tempSqlPath

if ($LASTEXITCODE -ne 0) {
    Write-AndonFail "Falha ao preparar banco PostgreSQL."
    exit 1
}

Write-AndonOk "Banco $Global:AndonDatabaseName e usuario $Global:AndonDatabaseUser preparados."

Write-AndonHeader "8. Testando conexao com banco"

$env:PGPASSWORD = $Global:AndonDatabasePassword

& $psql `
    -h localhost `
    -p $Global:AndonPostgresPort `
    -U $Global:AndonDatabaseUser `
    -d $Global:AndonDatabaseName `
    -c "SELECT current_database(), current_user;"

$dbTestExit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

if ($dbTestExit -ne 0) {
    Write-AndonFail "Falha no teste de conexao com banco."
    exit 1
}

Write-AndonOk "Conexao com banco validada."

Write-AndonHeader "9. Instalando backend"

$npmCmd = Get-AndonNpmCmd

if (!$npmCmd) {
    Write-AndonFail "npm.cmd nao encontrado."
    exit 1
}

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" install --include=dev --no-audit --no-fund" -WorkingDirectory $ServerPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run db:generate" -WorkingDirectory $ServerPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run db:migrate" -WorkingDirectory $ServerPath -LogName "install.log")) {
    exit 1
}

Write-AndonHeader "10. Rodando seed inicial"

Write-AndonWarn "Seed sera executado porque esta e uma instalacao limpa."

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run db:seed" -WorkingDirectory $ServerPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run build" -WorkingDirectory $ServerPath -LogName "install.log")) {
    exit 1
}

Write-AndonOk "Backend instalado e buildado."

Write-AndonHeader "11. Instalando frontend"

Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
$env:VITE_ANDON_DATA_MODE = "api"
$networkConfig = Ensure-AndonNetworkConfig
$env:VITE_ANDON_API_BASE_URL = $networkConfig.apiUrl

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" install --include=dev --no-audit --no-fund" -WorkingDirectory $Global:AndonProjectPath -LogName "install.log")) {
    exit 1
}

if (!(Invoke-AndonCommand -Command "`"$npmCmd`" run build" -WorkingDirectory $Global:AndonProjectPath -LogName "install.log")) {
    exit 1
}

Remove-Item Env:\VITE_ANDON_DATA_MODE -ErrorAction SilentlyContinue
Remove-Item Env:\VITE_ANDON_API_BASE_URL -ErrorAction SilentlyContinue

Write-AndonOk "Frontend instalado e buildado."

Write-AndonHeader "12. Criando regras de firewall"
Create-AndonFirewallRules

Write-AndonHeader "13. Recriando tarefas automaticas"
Recreate-AndonTasksSafe

Write-AndonHeader "14. Iniciando servicos"
Start-AndonServicesSafe

Write-AndonHeader "15. Health check final"

Start-Sleep -Seconds 10

if (Invoke-AndonHealthCheck) {
    Write-AndonOk "Instalacao concluida com health check executado."
} else {
    Write-AndonWarn "Instalacao finalizada, mas health check indicou problemas. Verifique logs."
}

Write-AndonHeader "ANDON - INSTALACAO LIMPA FINALIZADA"

Write-Host "Acesso local:" -ForegroundColor Green
Write-Host "http://localhost:$Global:AndonFrontendPort"
Write-Host ""
Write-Host "API:" -ForegroundColor Green
Write-Host "http://localhost:$Global:AndonApiPort"
Write-Host ""
Write-Host "Pasta do projeto:" -ForegroundColor Green
Write-Host $Global:AndonProjectPath
Write-Host ""
Write-Host "Ferramentas:" -ForegroundColor Green
Write-Host $Global:AndonToolsPath
Write-Host ""

exit 0

