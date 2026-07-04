$ErrorActionPreference = "Stop"

$CommonPath = Join-Path $PSScriptRoot "AndonInstaller.Common.ps1"

if (!(Test-Path $CommonPath)) {
    Write-Host "ERRO: biblioteca comum nao encontrada:" -ForegroundColor Red
    Write-Host $CommonPath
    exit 1
}

. $CommonPath

Write-AndonHeader "ANDON - CONFIGURAR POSTGRESQL"

Assert-AndonAdmin

$config = Select-AndonPostgresConfig

if (!$config) {
    Write-AndonFail "Configuracao do PostgreSQL cancelada ou invalida."
    exit 1
}

$networkConfig = Ensure-AndonNetworkConfig

if (!(Write-AndonBackendEnv -NetworkConfig $networkConfig -PreserveExisting -ForceDatabaseUrl)) {
    Write-AndonFail "Falha ao atualizar .env do backend."
    exit 1
}

Write-AndonHeader "TESTE OPCIONAL DA CONEXAO DO BANCO ANDON"

$psql = Get-AndonPsql

if (!$psql) {
    Write-AndonWarn "psql.exe nao encontrado. Nao foi possivel testar a conexao."
} else {
    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Global:AndonDatabasePassword

    try {
        & $psql `
            -h $config.postgresHost `
            -p $config.postgresPort `
            -U $config.databaseUser `
            -d $config.databaseName `
            -c "SELECT current_database(), current_user;"

        if ($LASTEXITCODE -eq 0) {
            Write-AndonOk "Conexao com banco ANDON validada."
        } else {
            Write-AndonWarn "Nao foi possivel conectar no banco ANDON com usuario $($config.databaseUser)."
            Write-AndonWarn "Isso e esperado se a instalacao limpa ainda nao preparou o banco/usuario."
        }
    } finally {
        $env:PGPASSWORD = $oldPassword
    }
}

Write-AndonHeader "CONFIGURACAO POSTGRESQL FINALIZADA"

Write-Host "Arquivo global:" -ForegroundColor Green
Write-Host $Global:AndonConfigPath
Write-Host ""
Write-Host ".env backend:" -ForegroundColor Green
Write-Host "$Global:AndonProjectPath\server\.env"
Write-Host ""
Write-Host "PostgreSQL configurado em:" -ForegroundColor Green
Write-Host "$($config.postgresHost):$($config.postgresPort)"
Write-Host ""

exit 0
