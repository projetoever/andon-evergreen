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

$Global:AndonProjectPath = "C:\web-andon-industrial\andon"
$Global:AndonNodeExePath = "C:\web-andon-industrial\runtime\node\node.exe"

. (Join-Path $repositoryRoot "installer\AndonInstaller.Runtime.ps1")

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
