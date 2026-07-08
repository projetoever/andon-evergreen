. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

try {
    Assert-AndonAdmin
    $config = Import-AndonConfig
    Write-AndonHeader "CONFIGURAR POSTGRESQL/PORTA DO BANCO"
    Write-Host "Modo atual: $($config.databaseMode)"
    Write-Host "PostgreSQL atual: $($config.postgresHost):$($config.postgresPort)"
    Write-Host ""
    Write-Host "1 - Manter modo atual e alterar apenas porta"
    Write-Host "2 - Alterar para Docker recomendado"
    Write-Host "3 - Alterar para PostgreSQL local"
    Write-Host "0 - Cancelar"
    Write-Host ""
    $choice = Read-Host "Escolha uma opcao"
    switch ($choice) {
        "1" { $newPort = Read-AndonPort "Nova porta PostgreSQL" ([int]$config.postgresPort); $config.postgresHost = "127.0.0.1"; $config.postgresPort = [int]$newPort; Save-AndonConfig $config; $network = Ensure-AndonNetworkConfig; Write-AndonBackendEnv -Config $config -NetworkConfig $network }
        "2" { Initialize-AndonDockerDatabase | Out-Null }
        "3" { Initialize-AndonLocalDatabase | Out-Null }
        "0" { Write-AndonWarn "Cancelado."; exit 0 }
        default { throw "Opcao invalida." }
    }
    Write-AndonOk "Configuracao de banco atualizada."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
