. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

$exitCode = 0
$logStarted = $false

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites
    $currentCommit = Get-AndonRepositoryCommit
    Start-AndonInstallerLog -Operation "repair" -CommitSha $currentCommit
    $logStarted = $true
    Write-AndonHeader "REPARAR INSTALACAO"
    $config = Import-AndonConfig
    if (!(Test-Path $Global:AndonConfigPath)) { throw "andon-config.json nao encontrado. Rode uma instalacao limpa antes." }
    Write-AndonOk "Modo preservado: $($config.databaseMode)"
    Stop-AndonRuntime
    Ensure-AndonDedicatedNodeRuntime
    $network = Ensure-AndonNetworkConfig
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    Invoke-AndonNodePipeline -RunSeed $false -InstallDependencies $true
    Apply-AndonFirewallRules
    Prepare-AndonChromeProfileForReuse
    Recreate-AndonTasks
    Start-AndonRuntime
    Invoke-AndonHealthCheck -Full
    $config = Set-AndonConfigProperty `
        -Config $config `
        -Name "installedCommit" `
        -Value $currentCommit
    Save-AndonConfig $config
    Write-AndonHeader "REPARACAO FINALIZADA"
    Write-AndonOk "Reparacao concluida sem db:seed no SHA $currentCommit."
} catch {
    $exitCode = 1
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
} finally {
    if ($logStarted) { Stop-AndonInstallerLog }
}

exit $exitCode
