param(
    [switch]$ContinueAfterSync
)

. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites

    if (!$ContinueAfterSync) {
        Write-AndonHeader "ATUALIZAR PELA MAIN - SINCRONIZACAO"

        $config = Import-AndonConfig
        if (!(Test-Path $Global:AndonConfigPath)) {
            throw "andon-config.json nao encontrado. Rode uma instalacao limpa antes."
        }

        Write-AndonOk "Modo preservado: $($config.databaseMode)"
        Write-AndonOk "O ANDON permanecera ativo durante a sincronizacao do instalador."

        Sync-AndonRepositoryAndTools

        $updatedScriptPath =
            Join-Path `
                $Global:AndonInstallerPath `
                "update-andon-server.ps1"

        if (!(Test-Path $updatedScriptPath -PathType Leaf)) {
            throw "Script de atualizacao sincronizado nao encontrado: $updatedScriptPath"
        }

        $powershellPath =
            Get-AndonCommandPath `
                "powershell.exe" `
                "O Windows PowerShell 5.1 e obrigatorio."

        Write-AndonOk "Instalador sincronizado. Iniciando fase atualizada em novo processo."

        & $powershellPath `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $updatedScriptPath `
            -ContinueAfterSync

        $updatedProcessExitCode = $LASTEXITCODE
        if ($updatedProcessExitCode -ne 0) {
            throw "A fase atualizada terminou com codigo $updatedProcessExitCode."
        }

        exit 0
    }

    # Esta fase roda em um novo powershell.exe. Por isso, os modulos abaixo
    # sao necessariamente os arquivos novos copiados pela sincronizacao.
    . "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
    . "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
    . "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

    Write-AndonHeader "ATUALIZAR PELA MAIN - APLICACAO"

    $config = Import-AndonConfig
    if (!(Test-Path $Global:AndonConfigPath)) {
        throw "andon-config.json nao encontrado. Rode uma instalacao limpa antes."
    }

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
    Invoke-AndonHealthCheck
    Write-AndonHeader "ATUALIZACAO FINALIZADA"
    Write-AndonOk "Atualizacao concluida sem db:seed."
    exit 0
} catch {
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
