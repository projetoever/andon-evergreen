. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites
    Write-AndonHeader "ATUALIZAR PELA MAIN"
    $config = Import-AndonConfig
    if (!(Test-Path $Global:AndonConfigPath)) { throw "andon-config.json nao encontrado. Rode uma instalacao limpa antes." }
    Write-AndonOk "Modo preservado: $($config.databaseMode)"
    Stop-AndonRuntime
    Sync-AndonRepositoryAndTools
    $network = Ensure-AndonNetworkConfig
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    Invoke-AndonNodePipeline -RunSeed $false -InstallDependencies $true
    Apply-AndonFirewallRules
    Prepare-AndonChromeProfileForReuse
    Recreate-AndonTasks
    Start-AndonRuntime
    Invoke-AndonHealthCheck
    Write-AndonHeader "ATUALIZACAO FINALIZADA"
    Write-AndonOk "Atualizacao concluida sem db:seed."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
