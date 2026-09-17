param(
    [switch]$ContinueAfterSync,
    [string]$ExpectedCommit = ""
)

. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

$exitCode = 0
$logStarted = $false

function Invoke-AndonGitRead {
    param(
        [Parameter(Mandatory = $true)][string]$GitPath,
        [Parameter(Mandatory = $true)][string[]]$GitArguments,
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    $output = @(
        Invoke-AndonNativeSafe {
            & $GitPath -C $Global:AndonProjectPath $GitArguments 2>$null
        }
    )
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }

    $value = ($output -join "`n").Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw $FailureMessage
    }

    return $value
}

function Get-AndonLegacyRelaunchCommit {
    # O updater d54f656 relanca o script novo somente com -ContinueAfterSync.
    # Esta compatibilidade usa apenas o repositorio ja sincronizado e nunca busca outro SHA.
    Assert-AndonRepositoryClean -ProjectPath $Global:AndonProjectPath

    $git = Get-AndonCommandPath "git.exe" "Instale Git for Windows."
    $branch =
        Invoke-AndonGitRead `
            -GitPath $git `
            -GitArguments @("symbolic-ref", "--short", "HEAD") `
            -FailureMessage "Nao foi possivel determinar a branch atual no relaunch legado."

    if ($branch -ne "main") {
        throw "Relaunch legado permitido somente na branch main. Branch atual: $branch."
    }

    $head =
        Invoke-AndonGitRead `
            -GitPath $git `
            -GitArguments @("rev-parse", "HEAD") `
            -FailureMessage "Nao foi possivel determinar HEAD no relaunch legado."
    $originMain =
        Invoke-AndonGitRead `
            -GitPath $git `
            -GitArguments @("rev-parse", "origin/main") `
            -FailureMessage "Nao foi possivel determinar origin/main no relaunch legado."

    if ($head -notmatch '^[0-9a-f]{40}$') {
        throw "SHA HEAD invalido no relaunch legado: $head"
    }
    if ($originMain -notmatch '^[0-9a-f]{40}$') {
        throw "SHA origin/main invalido no relaunch legado: $originMain"
    }
    if ($head -ne $originMain) {
        throw "HEAD diverge de origin/main no relaunch legado. HEAD: $head. origin/main: $originMain."
    }

    Write-AndonWarn (
        "Relaunch legado detectado sem ExpectedCommit; " +
        "SHA atual validado contra origin/main: $head."
    )
    return $head
}

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

        $selectedCommit = Sync-AndonRepositoryAndTools
        $config = Set-AndonConfigProperty `
            -Config $config `
            -Name "installedCommit" `
            -Value $selectedCommit
        Save-AndonConfig $config
        Write-AndonOk "SHA do working tree registrado antes da aplicacao: $selectedCommit."

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
            -ContinueAfterSync `
            -ExpectedCommit $selectedCommit

        $updatedProcessExitCode = $LASTEXITCODE
        if ($updatedProcessExitCode -ne 0) {
            throw "A fase atualizada terminou com codigo $updatedProcessExitCode."
        }

    } else {
        $legacyRelaunch = [string]::IsNullOrWhiteSpace($ExpectedCommit)
        if ($legacyRelaunch) {
            $pinnedCommit = Get-AndonLegacyRelaunchCommit
        } else {
            $pinnedCommit = Assert-AndonRepositoryCommit -ExpectedCommit $ExpectedCommit
        }
        Start-AndonInstallerLog -Operation "update" -CommitSha $pinnedCommit
        $logStarted = $true

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

        if ($legacyRelaunch) {
            $config = Set-AndonConfigProperty `
                -Config $config `
                -Name "installedCommit" `
                -Value $pinnedCommit
            Save-AndonConfig $config
            Write-AndonOk "SHA validado do relaunch legado registrado: $pinnedCommit."
        } else {
            $configuredCommit = "$($config.installedCommit)".Trim().ToLowerInvariant()
            if ($configuredCommit -ne $pinnedCommit) {
                throw (
                    "installedCommit diverge do SHA fixado para a atualizacao. " +
                    "Configurado: $configuredCommit. Esperado: $pinnedCommit."
                )
            }
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
        Write-AndonOk "Atualizacao concluida sem db:seed no SHA $pinnedCommit."
    }
} catch {
    $exitCode = 1
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
} finally {
    if ($logStarted) { Stop-AndonInstallerLog }
}

exit $exitCode
