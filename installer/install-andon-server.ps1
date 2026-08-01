. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites
    Write-AndonHeader "INSTALACAO LIMPA DO ANDON"
    if (!(Confirm-AndonTyped -Message "A instalacao limpa prepara banco, roda db:migrate, db:seed e build. Use apenas em ambiente novo ou apos backup confirmado." -Expected "APAGAR")) { Write-AndonWarn "Instalacao cancelada."; exit 0 }
    $installationProfile = Select-AndonInstallationProfile
    Write-AndonOk "Perfil inicial selecionado: $installationProfile"
    Sync-AndonRepositoryAndTools
    Initialize-AndonFolders
    $network = Select-AndonServerIp
    Write-AndonHeader "ESCOLHA DO BANCO DE DADOS"
    Write-Host "1 - PostgreSQL local no Windows - recomendado para HOST/producao"
    Write-Host "2 - PostgreSQL via Docker - desenvolvimento, notebook ou testes"
    Write-Host "0 - Cancelar"
    Write-Host ""
    $dbConfig = $null
    do {
        $choice = Read-Host "Escolha o modo de banco"
        switch ($choice) {
            "1" { $dbConfig = Initialize-AndonLocalDatabase }
            "2" { $dbConfig = Initialize-AndonDockerDatabase }
            "0" { Write-AndonWarn "Instalacao cancelada."; exit 0 }
            default { Write-AndonFail "Opcao invalida." }
        }
    } while (!$dbConfig)
    $dbConfig.installationProfile = $installationProfile
    Save-AndonConfig $dbConfig
    Stop-AndonRuntime
    Write-AndonBackendEnv -Config $dbConfig -NetworkConfig $network
    Invoke-AndonNodePipeline -RunSeed $true -InstallDependencies $true -SeedProfile $installationProfile
    Apply-AndonFirewallRules
    Clear-AndonChromeProfile
    Recreate-AndonTasks
    Start-AndonRuntime
    Invoke-AndonHealthCheck -Full
    Write-AndonHeader "INSTALACAO LIMPA FINALIZADA"
    Write-AndonOk "ANDON instalado com databaseMode=$($dbConfig.databaseMode) e installationProfile=$installationProfile."
    Write-Host "Acesso Raspberry/clients: http://$($network.serverIp):$Global:AndonFrontendPort"
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; Write-Host "Envie este bloco completo para ajuste."; exit 1 }
