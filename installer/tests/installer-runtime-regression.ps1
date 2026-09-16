$ErrorActionPreference = "Stop"

$repositoryRoot =
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Assert-AndonTest {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (!$Condition) {
        throw "FALHA: $Message"
    }
}

Write-Host "Validando parser PowerShell..."

$powerShellFiles = @(
    Get-ChildItem `
        -Path $repositoryRoot `
        -Filter "*.ps1" `
        -File `
        -Recurse
)

foreach ($powerShellFile in $powerShellFiles) {
    $tokens = $null
    $parseErrors = $null

    [System.Management.Automation.Language.Parser]::ParseFile(
        $powerShellFile.FullName,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null

    if ($parseErrors.Count -gt 0) {
        $messages =
            $parseErrors |
            ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }

        throw (
            "Erro de parser em $($powerShellFile.FullName): " +
            ($messages -join "; ")
        )
    }
}

Write-Host "Parser PowerShell aprovado em $($powerShellFiles.Count) arquivo(s)."

. (Join-Path $repositoryRoot "installer\AndonInstaller.Common.ps1")
$Global:AndonProjectPath = "C:\web-andon-industrial\andon"
$Global:AndonNodeExePath = "C:\web-andon-industrial\runtime\node\node.exe"
. (Join-Path $repositoryRoot "installer\AndonInstaller.Runtime.ps1")

$legacyConfig = [pscustomobject]@{
    databaseMode = "docker"
}
$legacyConfig =
    Set-AndonConfigProperty `
        -Config $legacyConfig `
        -Name "installationProfile" `
        -Value "empty"

Assert-AndonTest `
    -Condition ($legacyConfig.installationProfile -eq "empty") `
    -Message "Config legada deve aceitar installationProfile por Add-Member seguro"

$secretPreview =
    Protect-AndonLogText (
        "docker run -e POSTGRES_PASSWORD=segredo " +
        "postgresql://andon:outra-senha@127.0.0.1:5432/andon_db"
    )

Assert-AndonTest `
    -Condition ($secretPreview -notmatch "segredo|outra-senha") `
    -Message "Sanitizacao nao pode manter senha no preview do log"

Assert-AndonTest `
    -Condition ($secretPreview -match "POSTGRES_PASSWORD=\*\*\*") `
    -Message "Sanitizacao deve mascarar POSTGRES_PASSWORD"

function Invoke-RestMethod {
    param(
        [Parameter(Position = 0)]
        [string]$Uri,
        [int]$TimeoutSec
    )

    return @()
}

$emptyWriteResult = Test-AndonApiWrite

Assert-AndonTest `
    -Condition ($emptyWriteResult.Status -eq "SKIP") `
    -Message "Perfil empty sem maquinas deve retornar SKIP"

Remove-Item Function:\Invoke-RestMethod

Write-Host "installationProfile, sanitizacao e health empty aprovados."

$processScenarios = @(
    @{
        Name = "Node dedicado com API ANDON"
        ExecutablePath = $Global:AndonNodeExePath
        CommandLine =
            '"C:\web-andon-industrial\runtime\node\node.exe" "C:\web-andon-industrial\andon\server\dist\server.js"'
        Expected = $true
    },
    @{
        Name = "Node global legado com API ANDON"
        ExecutablePath = "C:\Program Files\nodejs\node.exe"
        CommandLine =
            '"C:\Program Files\nodejs\node.exe" "C:\web-andon-industrial\andon\server\dist\server.js"'
        Expected = $true
    },
    @{
        Name = "Node global legado com Vite ANDON"
        ExecutablePath = "C:\Program Files\nodejs\node.exe"
        CommandLine =
            '"C:\Program Files\nodejs\node.exe" "C:\web-andon-industrial\andon\node_modules\.bin\..\vite\bin\vite.js" preview --host 0.0.0.0'
        Expected = $true
    },
    @{
        Name = "Node global com aplicacao externa"
        ExecutablePath = "C:\Program Files\nodejs\node.exe"
        CommandLine =
            '"C:\Program Files\nodejs\node.exe" "D:\erp\dist\server.js"'
        Expected = $false
    },
    @{
        Name = "Node global no projeto sem marcador oficial"
        ExecutablePath = "C:\Program Files\nodejs\node.exe"
        CommandLine =
            '"C:\Program Files\nodejs\node.exe" "C:\web-andon-industrial\andon\scripts\utilitario.js"'
        Expected = $false
    }
)

foreach ($scenario in $processScenarios) {
    $actual =
        Test-AndonNodeProcessOwned `
            -ExecutablePath $scenario.ExecutablePath `
            -CommandLine $scenario.CommandLine

    Assert-AndonTest `
        -Condition ($actual -eq $scenario.Expected) `
        -Message $scenario.Name
}

Write-Host "Politica de processos Node aprovada em $($processScenarios.Count) cenarios."

$commonScript =
    Get-Content `
        (Join-Path $repositoryRoot "installer\AndonInstaller.Common.ps1") `
        -Raw

$installScript =
    Get-Content `
        (Join-Path $repositoryRoot "installer\install-andon-server.ps1") `
        -Raw

$localDatabaseScript =
    Get-Content `
        (Join-Path $repositoryRoot "installer\AndonInstaller.Database.Local.ps1") `
        -Raw

$dockerDatabaseScript =
    Get-Content `
        (Join-Path $repositoryRoot "installer\AndonInstaller.Database.Docker.ps1") `
        -Raw

Assert-AndonTest `
    -Condition ($installScript -notmatch '\$dbConfig\.installationProfile\s*=') `
    -Message "Instalacao nao pode depender da propriedade installationProfile preexistente"

Assert-AndonTest `
    -Condition ($installScript -match 'Set-AndonConfigProperty[\s\S]*-Name "installationProfile"') `
    -Message "Instalacao deve aplicar installationProfile pelo helper seguro"

Assert-AndonTest `
    -Condition ($localDatabaseScript -notmatch 'Save-AndonConfig') `
    -Message "PostgreSQL local nao pode persistir config legacy antes do perfil"

Assert-AndonTest `
    -Condition ($dockerDatabaseScript -notmatch 'Save-AndonConfig') `
    -Message "Docker nao pode persistir config legacy antes do perfil"

Assert-AndonTest `
    -Condition ($commonScript -match 'node\.staging\.\$operationId') `
    -Message "Runtime Node deve usar staging dentro da arvore controlada"

Assert-AndonTest `
    -Condition ($commonScript -match 'Invoke-AndonMoveItemWithRetry') `
    -Message "Runtime Node deve ter retry limitado de ativacao"

Assert-AndonTest `
    -Condition ($commonScript -match 'fallback seguro por copia') `
    -Message "Runtime Node deve ter fallback por copia"

Assert-AndonTest `
    -Condition ($commonScript -match 'Runtime Node anterior restaurado e validado') `
    -Message "Runtime Node deve validar rollback"

$networkSelectionStart = $commonScript.IndexOf("function Select-AndonServerIp")
$networkSelectionEnd = $commonScript.IndexOf("function Ensure-AndonNetworkConfig")
$networkSelection =
    $commonScript.Substring(
        $networkSelectionStart,
        $networkSelectionEnd - $networkSelectionStart
    )

Assert-AndonTest `
    -Condition ($networkSelection -match 'Read-Host "Escolha o IP') `
    -Message "Multi-IP deve manter escolha explicita"

Assert-AndonTest `
    -Condition ($networkSelection -notmatch 'DefaultIPGateway|Get-NetRoute') `
    -Message "Multi-IP nao pode selecionar automaticamente por rota"

Assert-AndonTest `
    -Condition ($commonScript -notmatch '189\.201\.137\.232') `
    -Message "IP do piloto nao pode ser hardcoded"

$precheckIndex = $localDatabaseScript.IndexOf("PRECHECK POSTGRESQL LOCAL")
$mutableSqlIndex = $localDatabaseScript.IndexOf("`$mutableStatements = @()")

Assert-AndonTest `
    -Condition ($precheckIndex -ge 0 -and $mutableSqlIndex -gt $precheckIndex) `
    -Message "Precheck PostgreSQL deve ocorrer antes de SQL mutavel"

Assert-AndonTest `
    -Condition ($localDatabaseScript -match 'rolcanlogin, rolsuper, rolcreatedb, rolcreaterole') `
    -Message "Precheck PostgreSQL deve validar LOGIN e privilegios"

$installProvisioningSection =
    $localDatabaseScript.Substring(
        0,
        $localDatabaseScript.IndexOf("function Remove-AndonLocalDatabaseClean")
    )

Assert-AndonTest `
    -Condition ($installProvisioningSection -notmatch 'ALTER USER|GRANT ALL PRIVILEGES|pg_terminate_backend') `
    -Message "Provisionamento nao pode ampliar role existente nem matar sessoes"

$installSyncIndex = $installScript.IndexOf("Sync-AndonRepositoryAndTools")
$installRelaunchIndex = $installScript.IndexOf("& `$powershellPath")
$installRuntimeModuleIndex = $installScript.IndexOf("AndonInstaller.Runtime.ps1")

Assert-AndonTest `
    -Condition ($installSyncIndex -ge 0 -and $installRelaunchIndex -gt $installSyncIndex) `
    -Message "Fresh install deve relancar depois do sync"

Assert-AndonTest `
    -Condition ($installRuntimeModuleIndex -gt $installRelaunchIndex) `
    -Message "Fresh install deve carregar modulo novo somente depois do relancamento"

Assert-AndonTest `
    -Condition ($installScript -match '-ExpectedCommit \$selectedCommit') `
    -Message "Fresh install deve propagar SHA fixado"

Write-Host "Hardening direcionado do installer aprovado."

$updateScriptPath =
    Join-Path $repositoryRoot "installer\update-andon-server.ps1"

$updateScript =
    Get-Content $updateScriptPath -Raw

$syncIndex = $updateScript.IndexOf("Sync-AndonRepositoryAndTools")
$relaunchIndex = $updateScript.IndexOf("& `$powershellPath")
$runtimeModuleIndex = $updateScript.IndexOf("AndonInstaller.Runtime.ps1")
$stopIndex = $updateScript.IndexOf("Stop-AndonRuntime")
$ensureNodeIndex = $updateScript.IndexOf("Ensure-AndonDedicatedNodeRuntime")
$pipelineIndex = $updateScript.IndexOf("Invoke-AndonNodePipeline")

Assert-AndonTest `
    -Condition ($syncIndex -ge 0) `
    -Message "Sync ausente na primeira fase"

Assert-AndonTest `
    -Condition ($relaunchIndex -gt $syncIndex) `
    -Message "Relancamento deve ocorrer depois do sync"

Assert-AndonTest `
    -Condition ($runtimeModuleIndex -gt $relaunchIndex) `
    -Message "Modulo Runtime novo deve ser carregado na segunda fase"

Assert-AndonTest `
    -Condition ($stopIndex -gt $runtimeModuleIndex) `
    -Message "Parada deve usar o modulo Runtime novo"

Assert-AndonTest `
    -Condition ($ensureNodeIndex -gt $stopIndex) `
    -Message "Node dedicado deve ser garantido apos a parada"

Assert-AndonTest `
    -Condition ($pipelineIndex -gt $ensureNodeIndex) `
    -Message "Pipeline deve rodar depois da preparacao do Node dedicado"

foreach ($singleExecutionMarker in @(
    "Sync-AndonRepositoryAndTools",
    "Stop-AndonRuntime",
    "Ensure-AndonDedicatedNodeRuntime",
    "Invoke-AndonNodePipeline"
)) {
    $occurrences =
        [regex]::Matches(
            $updateScript,
            [regex]::Escape($singleExecutionMarker)
        ).Count

    Assert-AndonTest `
        -Condition ($occurrences -eq 1) `
        -Message "$singleExecutionMarker deve aparecer exatamente uma vez"
}

Assert-AndonTest `
    -Condition ($updateScript -match 'Invoke-AndonNodePipeline -RunSeed \$false') `
    -Message "Update deve desabilitar seed"

Assert-AndonTest `
    -Condition ($updateScript -notmatch 'Invoke-AndonNodePipeline -RunSeed \$true') `
    -Message "Update nao pode habilitar seed"

Write-Host "Fluxo de primeira atualizacao legada aprovado."
Write-Host "Todos os testes de regressao do instalador foram aprovados."
