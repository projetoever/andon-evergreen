. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

try {
    Assert-AndonAdmin
    $config = Import-AndonConfig
    Write-AndonHeader "CONFIGURAR POSTGRESQL/PORTA DO BANCO"
    Write-Host "Modo atual: $($config.databaseMode)"
    Write-Host "PostgreSQL atual: $($config.postgresHost):$($config.postgresPort)"
    Write-Host "Banco atual: $($config.databaseName)"
    Write-Host "Usuario atual: $($config.databaseUser)"
    Write-Host ""
    Write-Host "1 - Configurar PostgreSQL local (host, porta, banco e usuario)"
    Write-Host "2 - Alterar para Docker (somente desenvolvimento/testes)"
    Write-Host "3 - Manter configuracao atual sem alteracoes"
    Write-Host "0 - Cancelar"
    Write-Host ""
    $choice = Read-Host "Escolha uma opcao"
    switch ($choice) {
        "1" { $config = Initialize-AndonLocalDatabase -ExistingConfig $config; $network = Ensure-AndonNetworkConfig; Write-AndonBackendEnv -Config $config -NetworkConfig $network }
        "2" { Initialize-AndonDockerDatabase | Out-Null }
        "3" { Assert-AndonDatabaseTargetSafe -Config $config; Write-AndonOk "Configuracao atual preservada." }
        "0" { Write-AndonWarn "Cancelado."; exit 0 }
        default { throw "Opcao invalida." }
    }
    Write-AndonOk "Configuracao de banco atualizada."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
