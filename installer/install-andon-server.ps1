param(
    [switch]$ContinueAfterSync,
    [string]$ExpectedCommit = ""
)

. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

$exitCode = 0
$logStarted = $false

try {
    Assert-AndonAdmin
    Assert-AndonCorePrerequisites
    Assert-AndonFreshInstallTarget

    if (!$ContinueAfterSync) {
        Write-AndonHeader "INSTALACAO LIMPA - SINCRONIZACAO"
        $selectedCommit = Sync-AndonRepositoryAndTools
        $updatedScriptPath =
            Join-Path `
                $Global:AndonInstallerPath `
                "install-andon-server.ps1"

        if (!(Test-Path $updatedScriptPath -PathType Leaf)) {
            throw "Script de instalacao sincronizado nao encontrado: $updatedScriptPath"
        }

        $powershellPath =
            Get-AndonCommandPath `
                "powershell.exe" `
                "O Windows PowerShell 5.1 e obrigatorio."

        Write-AndonOk "Instalador sincronizado. Relancando no SHA fixado $selectedCommit."
        & $powershellPath `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $updatedScriptPath `
            -ContinueAfterSync `
            -ExpectedCommit $selectedCommit

        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "A fase fixada da instalacao terminou com codigo $exitCode."
        }
    } else {
        if ([string]::IsNullOrWhiteSpace($ExpectedCommit)) {
            throw "SHA esperado ausente na fase principal da instalacao."
        }

        $pinnedCommit = Assert-AndonRepositoryCommit -ExpectedCommit $ExpectedCommit
        Start-AndonInstallerLog -Operation "install" -CommitSha $pinnedCommit
        $logStarted = $true

        . "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
        . "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
        . "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

        Write-AndonHeader "INSTALACAO LIMPA DO ANDON"
        if (!(Confirm-AndonTyped -Message "A instalacao limpa prepara banco, roda db:migrate, db:seed e build. Use apenas em ambiente novo ou apos backup confirmado." -Expected "APAGAR")) {
            Write-AndonWarn "Instalacao cancelada."
        } else {
            $installationProfile = Select-AndonInstallationProfile
            Write-AndonOk "Perfil inicial selecionado: $installationProfile"
            Ensure-AndonDedicatedNodeRuntime
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
                    "0" { Write-AndonWarn "Instalacao cancelada."; break }
                    default { Write-AndonFail "Opcao invalida." }
                }
                if ($choice -eq "0") { break }
            } while (!$dbConfig)

            if ($dbConfig) {
                $dbConfig = Set-AndonConfigProperty `
                    -Config $dbConfig `
                    -Name "installationProfile" `
                    -Value $installationProfile
                $dbConfig = Set-AndonConfigProperty `
                    -Config $dbConfig `
                    -Name "installedCommit" `
                    -Value $pinnedCommit
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
                Write-AndonOk "ANDON instalado com databaseMode=$($dbConfig.databaseMode), installationProfile=$installationProfile e SHA=$pinnedCommit."
                Write-Host "Acesso Raspberry/clients: http://$($network.serverIp):$Global:AndonFrontendPort"
            }
        }
    }
} catch {
    $exitCode = 1
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    Write-Host "Envie este bloco completo para ajuste."
} finally {
    if ($logStarted) { Stop-AndonInstallerLog }
}

exit $exitCode
