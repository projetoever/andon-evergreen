. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites
    Write-AndonHeader "REPARAR INSTALACAO"
    $config = Import-AndonConfig
    if (!(Test-Path $Global:AndonConfigPath)) { throw "andon-config.json nao encontrado. Rode uma instalacao limpa antes." }
    Write-AndonOk "Modo preservado: $($config.databaseMode)"
    Stop-AndonRuntime
    $network = Ensure-AndonNetworkConfig
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    Invoke-AndonNodePipeline -RunSeed $false -InstallDependencies $true
    Apply-AndonFirewallRules
    Clear-AndonChromeProfile
    Recreate-AndonTasks
    Start-AndonRuntime
    Invoke-AndonHealthCheck -Full
    Write-AndonHeader "REPARACAO FINALIZADA"
    Write-AndonOk "Reparacao concluida sem db:seed."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
