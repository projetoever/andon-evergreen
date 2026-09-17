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

function Assert-AndonThrows {
    param(
        [scriptblock]$Action,
        [string]$ExpectedMessage,
        [string]$Message
    )

    $caught = $null
    try {
        & $Action
    } catch {
        $caught = $_.Exception.Message
    }

    Assert-AndonTest `
        -Condition (
            ![string]::IsNullOrWhiteSpace("$caught") -and
            "$caught" -match $ExpectedMessage
        ) `
        -Message $Message
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

Assert-AndonTest `
    -Condition ($commonScript -match 'function Get-AndonNodeRuntimeState') `
    -Message "Runtime Node deve classificar estado anterior completo e incompleto"

Assert-AndonTest `
    -Condition ($commonScript -match 'Move-Item falhou ou produziu destino invalido') `
    -Message "Validacao do destino deve integrar a tentativa por Move-Item"

Assert-AndonTest `
    -Condition ($commonScript -match '-Source \$ExtractedRuntime') `
    -Message "Fallback deve copiar da extracao original validada"

Assert-AndonTest `
    -Condition ($commonScript -match 'Move-Item recusado para evitar runtime aninhado') `
    -Message "Retry deve impedir Move-Item para destino ja existente"

Assert-AndonTest `
    -Condition ($commonScript -match 'Estado anterior incompleto[\s\S]*nao classificado como runtime valido') `
    -Message "Rollback incompleto nao pode ser reportado como runtime validado"

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
$installedCommitIndex = $updateScript.IndexOf('-Name "installedCommit"')
$saveConfigIndex = $updateScript.IndexOf("Save-AndonConfig `$config")
$relaunchIndex = $updateScript.IndexOf("& `$powershellPath")
$runtimeModuleIndex = $updateScript.IndexOf("AndonInstaller.Runtime.ps1")
$stopIndex = $updateScript.IndexOf("Stop-AndonRuntime")
$ensureNodeIndex = $updateScript.IndexOf("Ensure-AndonDedicatedNodeRuntime")
$pipelineIndex = $updateScript.IndexOf("Invoke-AndonNodePipeline")
$legacyFallbackIndex = $updateScript.LastIndexOf('if ($legacyRelaunch)')
$legacyInstalledCommitIndex =
    $updateScript.IndexOf('-Name "installedCommit"', $legacyFallbackIndex)
$legacySaveConfigIndex =
    $updateScript.IndexOf("Save-AndonConfig `$config", $legacyFallbackIndex)

Assert-AndonTest `
    -Condition ($syncIndex -ge 0) `
    -Message "Sync ausente na primeira fase"

Assert-AndonTest `
    -Condition ($relaunchIndex -gt $syncIndex) `
    -Message "Relancamento deve ocorrer depois do sync"

Assert-AndonTest `
    -Condition (
        $installedCommitIndex -gt $syncIndex -and
        $saveConfigIndex -gt $installedCommitIndex -and
        $relaunchIndex -gt $saveConfigIndex
    ) `
    -Message "installedCommit deve refletir o working tree antes do relancamento"

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

Assert-AndonTest `
    -Condition (
        $legacyFallbackIndex -ge 0 -and
        $legacyInstalledCommitIndex -gt $legacyFallbackIndex -and
        $legacySaveConfigIndex -gt $legacyInstalledCommitIndex -and
        $stopIndex -gt $legacySaveConfigIndex
    ) `
    -Message "Relaunch legado deve persistir installedCommit antes de parar ou aplicar"

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

Assert-AndonTest `
    -Condition ([regex]::Matches($updateScript, '-Name "installedCommit"').Count -eq 2) `
    -Message "Update deve persistir installedCommit no sync moderno e no fallback legado"

Assert-AndonTest `
    -Condition ([regex]::Matches($updateScript, 'Save-AndonConfig \$config').Count -eq 2) `
    -Message "Update deve salvar config no sync moderno e no fallback legado"

Assert-AndonTest `
    -Condition ($updateScript -match '\$configuredCommit -ne \$pinnedCommit') `
    -Message "Segunda fase deve rejeitar divergencia de installedCommit"

Assert-AndonTest `
    -Condition (
        $updateScript -match '\$legacyRelaunch = \[string\]::IsNullOrWhiteSpace\(\$ExpectedCommit\)' -and
        $updateScript -match '\$pinnedCommit = Get-AndonLegacyRelaunchCommit' -and
        $updateScript -match 'Assert-AndonRepositoryCommit -ExpectedCommit \$ExpectedCommit'
    ) `
    -Message "Fallback legado deve ser exclusivo de ExpectedCommit vazio e preservar caminho moderno"

$updateTokens = $null
$updateParseErrors = $null
$updateAst =
    [System.Management.Automation.Language.Parser]::ParseFile(
        $updateScriptPath,
        [ref]$updateTokens,
        [ref]$updateParseErrors
    )
$legacyResolverAst =
    $updateAst.Find(
        {
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
            $node.Name -eq "Get-AndonLegacyRelaunchCommit"
        },
        $true
    )

Assert-AndonTest `
    -Condition ($null -ne $legacyResolverAst) `
    -Message "Resolver seguro do relaunch legado deve existir"

$legacyResolverSource = $legacyResolverAst.Extent.Text
Assert-AndonTest `
    -Condition ($legacyResolverSource -notmatch '\bfetch\b|\bpull\b') `
    -Message "Fallback legado nao pode executar fetch ou pull"

Invoke-Expression $legacyResolverSource

$script:legacyTreeDirty = $false
$script:legacyBranch = "main"
$script:legacyHead = "a" * 40
$script:legacyOriginMain = "a" * 40
$script:legacyCallOrder = New-Object System.Collections.Generic.List[string]
$script:legacyWarning = ""

function Reset-AndonLegacyScenario {
    $script:legacyTreeDirty = $false
    $script:legacyBranch = "main"
    $script:legacyHead = "a" * 40
    $script:legacyOriginMain = "a" * 40
    $script:legacyCallOrder.Clear()
    $script:legacyWarning = ""
}

function Assert-AndonRepositoryClean {
    param([string]$ProjectPath)

    $script:legacyCallOrder.Add("working-tree") | Out-Null
    if ($script:legacyTreeDirty) {
        throw "Repositorio ANDON possui alteracoes locais."
    }
}

function Get-AndonCommandPath {
    param([string]$Name, [string]$FailureMessage)
    return "git.exe"
}

function Invoke-AndonGitRead {
    param(
        [string]$GitPath,
        [string[]]$GitArguments,
        [string]$FailureMessage
    )

    $command = $GitArguments -join " "
    $script:legacyCallOrder.Add($command) | Out-Null
    if ($command -eq "symbolic-ref --short HEAD") { return $script:legacyBranch }
    if ($command -eq "rev-parse HEAD") { return $script:legacyHead }
    if ($command -eq "rev-parse origin/main") { return $script:legacyOriginMain }
    throw $FailureMessage
}

function Write-AndonWarn {
    param([string]$Message)
    $script:legacyWarning = $Message
}

Reset-AndonLegacyScenario
$legacyPinnedCommit = Get-AndonLegacyRelaunchCommit
Assert-AndonTest `
    -Condition ($legacyPinnedCommit -eq $script:legacyHead) `
    -Message "Fallback legado deve fixar o SHA em HEAD"
Assert-AndonTest `
    -Condition (
        ($script:legacyCallOrder -join "|") -eq
        "working-tree|symbolic-ref --short HEAD|rev-parse HEAD|rev-parse origin/main"
    ) `
    -Message "Fallback legado deve validar tree, branch, HEAD e origin/main nessa ordem"
Assert-AndonTest `
    -Condition ($script:legacyWarning -match 'Relaunch legado detectado sem ExpectedCommit') `
    -Message "Fallback legado deve registrar warning explicito"

Reset-AndonLegacyScenario
$script:legacyTreeDirty = $true
Assert-AndonThrows `
    -Action { Get-AndonLegacyRelaunchCommit | Out-Null } `
    -ExpectedMessage "alteracoes locais" `
    -Message "Fallback legado deve rejeitar working tree sujo"

Reset-AndonLegacyScenario
$script:legacyBranch = "feature/teste"
Assert-AndonThrows `
    -Action { Get-AndonLegacyRelaunchCommit | Out-Null } `
    -ExpectedMessage "somente na branch main" `
    -Message "Fallback legado deve rejeitar branch diferente de main"

Reset-AndonLegacyScenario
$script:legacyOriginMain = "b" * 40
Assert-AndonThrows `
    -Action { Get-AndonLegacyRelaunchCommit | Out-Null } `
    -ExpectedMessage "HEAD diverge de origin/main" `
    -Message "Fallback legado deve rejeitar HEAD diferente de origin/main"

Reset-AndonLegacyScenario
$script:legacyHead = "sha-invalido"
Assert-AndonThrows `
    -Action { Get-AndonLegacyRelaunchCommit | Out-Null } `
    -ExpectedMessage "SHA HEAD invalido" `
    -Message "Fallback legado deve rejeitar SHA invalido"

Write-Host "Fluxo de primeira atualizacao legada aprovado."

$originalNodeVersionFunction = ${function:Get-AndonNodeRuntimeVersion}
$originalMoveFunction = ${function:Invoke-AndonMoveItemWithRetry}
$originalCopyFunction = ${function:Copy-AndonRuntimeContent}
$originalWarnFunction = ${function:Write-AndonWarn}
$originalRuntimeRoot = $Global:AndonRuntimeRoot
$originalRuntimePath = $Global:AndonNodeRuntimePath
$originalNodePath = $Global:AndonNodeExePath
$originalNpmPath = $Global:AndonNpmCmdPath
$runtimeScenarioRoot =
    Join-Path ([IO.Path]::GetTempPath()) "andon-runtime-regression-$([guid]::NewGuid().ToString('N'))"

function New-AndonFakeRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$RuntimePath,
        [string]$Version = "v22.23.2",
        [bool]$IncludeNode = $true,
        [bool]$IncludeNpm = $true
    )

    New-Item -ItemType Directory -Path $RuntimePath -Force | Out-Null
    if ($IncludeNode) {
        Set-Content -LiteralPath (Join-Path $RuntimePath "node.exe") -Value $Version -NoNewline
    }
    if ($IncludeNpm) {
        Set-Content -LiteralPath (Join-Path $RuntimePath "npm.cmd") -Value "npm" -NoNewline
    }
}

function Reset-AndonRuntimeScenario {
    if (Test-Path $runtimeScenarioRoot) {
        Remove-Item -LiteralPath $runtimeScenarioRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $runtimeScenarioRoot -Force | Out-Null

    $Global:AndonRuntimeRoot = $runtimeScenarioRoot
    $Global:AndonNodeRuntimePath = Join-Path $runtimeScenarioRoot "node"
    $Global:AndonNodeExePath = Join-Path $Global:AndonNodeRuntimePath "node.exe"
    $Global:AndonNpmCmdPath = Join-Path $Global:AndonNodeRuntimePath "npm.cmd"
    $script:runtimeMoveMode = "normal"
    $script:runtimeCopyFails = $false
    $script:runtimeWarnings = New-Object System.Collections.Generic.List[string]
}

function Get-AndonNodeRuntimeVersion {
    param([string]$NodePath = $Global:AndonNodeExePath)
    if (!(Test-Path $NodePath -PathType Leaf)) { return $null }
    return (Get-Content -LiteralPath $NodePath -Raw).Trim()
}

function Invoke-AndonMoveItemWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [int]$Attempts = 3,
        [int]$DelaySeconds = 2
    )

    $isActivation = $Source -like "*node.staging*"
    if ($isActivation -and $script:runtimeMoveMode -eq "throw") {
        throw "Move-Item simulado falhou"
    }
    if ($isActivation -and $script:runtimeMoveMode -eq "invalid") {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Copy-Item `
            -LiteralPath (Join-Path $Source "npm.cmd") `
            -Destination $Destination `
            -Force
        Remove-Item -LiteralPath $Source -Recurse -Force
        return
    }
    if ($isActivation -and $script:runtimeMoveMode -eq "nested") {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Move-Item -LiteralPath $Source -Destination $Destination
        return
    }

    & $originalMoveFunction `
        -Source $Source `
        -Destination $Destination `
        -Attempts $Attempts `
        -DelaySeconds 0
}

function Copy-AndonRuntimeContent {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if ($script:runtimeCopyFails -and $Destination -eq $Global:AndonNodeRuntimePath) {
        throw "Copia simulada falhou"
    }
    & $originalCopyFunction -Source $Source -Destination $Destination
}

function Write-AndonWarn {
    param([string]$Message)
    $script:runtimeWarnings.Add($Message) | Out-Null
}

try {
    # A: runtime anterior incompleto deve ser substituido por staging valido.
    Reset-AndonRuntimeScenario
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.a"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.a"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    New-AndonFakeRuntime `
        -RuntimePath $Global:AndonNodeRuntimePath `
        -IncludeNode $false `
        -IncludeNpm $false
    Enable-AndonDedicatedNodeRuntime `
        -ExtractedRuntime $extractedRuntime `
        -StagingRuntime $stagingRuntime `
        -PreviousRuntime $previousRuntime
    $scenarioState = Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath
    Assert-AndonTest `
        -Condition ($scenarioState.IsExpected -and !(Test-Path $previousRuntime)) `
        -Message "Cenario A: runtime incompleto deve ser substituido e validado"

    # B: Move-Item sem erro, mas destino invalido, deve cair na copia da extracao.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "invalid"
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.b"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.b"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    Enable-AndonDedicatedNodeRuntime `
        -ExtractedRuntime $extractedRuntime `
        -StagingRuntime $stagingRuntime `
        -PreviousRuntime $previousRuntime
    Assert-AndonTest `
        -Condition ((Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath).IsExpected) `
        -Message "Cenario B: destino invalido sem excecao deve acionar copia"

    # C: excecao do Move-Item deve cair na copia segura.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "throw"
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.c"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.c"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    Enable-AndonDedicatedNodeRuntime `
        -ExtractedRuntime $extractedRuntime `
        -StagingRuntime $stagingRuntime `
        -PreviousRuntime $previousRuntime
    Assert-AndonTest `
        -Condition ((Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath).IsExpected) `
        -Message "Cenario C: falha do Move-Item deve acionar copia"

    # D: falha de move e copia deve terminar de forma controlada.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "throw"
    $script:runtimeCopyFails = $true
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.d"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.d"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    Assert-AndonThrows `
        -Action {
            Enable-AndonDedicatedNodeRuntime `
                -ExtractedRuntime $extractedRuntime `
                -StagingRuntime $stagingRuntime `
                -PreviousRuntime $previousRuntime
        } `
        -ExpectedMessage "Falha na ativacao do runtime Node" `
        -Message "Cenario D: falha total deve ser controlada"

    # E: runtime anterior utilizavel deve voltar com a versao original.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "throw"
    $script:runtimeCopyFails = $true
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.e"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.e"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    New-AndonFakeRuntime -RuntimePath $Global:AndonNodeRuntimePath -Version "v20.18.0"
    Assert-AndonThrows `
        -Action {
            Enable-AndonDedicatedNodeRuntime `
                -ExtractedRuntime $extractedRuntime `
                -StagingRuntime $stagingRuntime `
                -PreviousRuntime $previousRuntime
        } `
        -ExpectedMessage "Falha na ativacao do runtime Node" `
        -Message "Cenario E: falha total deve preservar erro original"
    $restoredState = Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath
    Assert-AndonTest `
        -Condition ($restoredState.IsUsable -and $restoredState.DetectedVersion -eq "v20.18.0") `
        -Message "Cenario E: rollback deve restaurar e validar versao anterior"

    # F: estado anterior incompleto pode ser preservado, nunca validado como utilizavel.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "throw"
    $script:runtimeCopyFails = $true
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.f"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.f"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    New-AndonFakeRuntime `
        -RuntimePath $Global:AndonNodeRuntimePath `
        -Version "v20.18.0" `
        -IncludeNpm $false
    Assert-AndonThrows `
        -Action {
            Enable-AndonDedicatedNodeRuntime `
                -ExtractedRuntime $extractedRuntime `
                -StagingRuntime $stagingRuntime `
                -PreviousRuntime $previousRuntime
        } `
        -ExpectedMessage "Falha na ativacao do runtime Node" `
        -Message "Cenario F: falha total deve preservar erro original"
    $restoredState = Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath
    Assert-AndonTest `
        -Condition (
            !$restoredState.IsUsable -and
            ($script:runtimeWarnings -join "|") -match "nao classificado como runtime valido" -and
            ($script:runtimeWarnings -join "|") -notmatch "anterior restaurado e validado"
        ) `
        -Message "Cenario F: runtime incompleto restaurado nao pode ser chamado de validado"

    # G: destino aninhado e invalido deve ser rejeitado e substituido no caminho exato.
    Reset-AndonRuntimeScenario
    $script:runtimeMoveMode = "nested"
    $extractedRuntime = Join-Path $runtimeScenarioRoot "extracted"
    $stagingRuntime = Join-Path $runtimeScenarioRoot "node.staging.g"
    $previousRuntime = Join-Path $runtimeScenarioRoot "node.previous.g"
    New-AndonFakeRuntime -RuntimePath $extractedRuntime
    New-AndonFakeRuntime -RuntimePath $stagingRuntime
    Enable-AndonDedicatedNodeRuntime `
        -ExtractedRuntime $extractedRuntime `
        -StagingRuntime $stagingRuntime `
        -PreviousRuntime $previousRuntime
    $scenarioState = Get-AndonNodeRuntimeState -RuntimePath $Global:AndonNodeRuntimePath
    Assert-AndonTest `
        -Condition (
            $scenarioState.IsExpected -and
            !(Test-Path (Join-Path $Global:AndonNodeRuntimePath "node.staging.g"))
        ) `
        -Message "Cenario G: runtime aninhado deve ser rejeitado e nao permanecer"
} finally {
    Set-Item Function:\Get-AndonNodeRuntimeVersion -Value $originalNodeVersionFunction
    Set-Item Function:\Invoke-AndonMoveItemWithRetry -Value $originalMoveFunction
    Set-Item Function:\Copy-AndonRuntimeContent -Value $originalCopyFunction
    Set-Item Function:\Write-AndonWarn -Value $originalWarnFunction
    $Global:AndonRuntimeRoot = $originalRuntimeRoot
    $Global:AndonNodeRuntimePath = $originalRuntimePath
    $Global:AndonNodeExePath = $originalNodePath
    $Global:AndonNpmCmdPath = $originalNpmPath
    Remove-Item -LiteralPath $runtimeScenarioRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Ativacao e rollback do runtime Node aprovados nos cenarios A-G."
Write-Host "Todos os testes de regressao do instalador foram aprovados."
