$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "frontend-start"
$packagePath = Join-Path $context.ProjectPath "package.json"
$clientBuildPath = Join-Path $context.ProjectPath "dist\client"

function Write-FrontendLog {
    param(
        [string]$Message,

        [ValidateSet("INFO", "OK", "AVISO", "ERRO")]
        [string]$Level = "INFO"
    )

    Write-AndonRuntimeLog `
        -Component $component `
        -Message $Message `
        -Level $Level
}

Write-FrontendLog `
    -Message "Verificando frontend em $($context.FrontendUrl)."

if (
    Test-AndonRuntimeHttp `
        -Url $context.FrontendUrl `
        -TimeoutSeconds 5
) {
    Write-FrontendLog `
        -Level "OK" `
        -Message "Frontend ja esta acessivel."

    exit 0
}

if (!(Test-Path $packagePath -PathType Leaf)) {
    throw "package.json nao encontrado: $packagePath"
}

if (!(Test-Path $clientBuildPath -PathType Container)) {
    throw (
        "Build do frontend nao encontrado: $clientBuildPath. " +
        "Execute instalacao, atualizacao ou reparo."
    )
}

$portProcessIds =
    Get-AndonRuntimePortProcessIds `
        -Port $context.FrontendPort

if ($portProcessIds.Count -gt 0) {
    Write-FrontendLog `
        -Level "AVISO" `
        -Message (
            "Porta $($context.FrontendPort) ocupada, mas o frontend " +
            "nao respondeu corretamente."
        )

    Stop-AndonRuntimeOwnedPortProcesses `
        -Port $context.FrontendPort `
        -Component $component `
        -ExpectedMarkers @(
            (Join-Path $context.ProjectPath "node_modules")
        )

    Start-Sleep -Seconds 3
}

$npmPath =
    Get-AndonRuntimeCommandPath `
        -CommandName "npm.cmd" `
        -FallbackPaths @(
            "C:\Program Files\nodejs\npm.cmd"
        )

$previousLocation = Get-Location

try {
    Set-Location $context.ProjectPath

    $env:NODE_ENV = "production"

    Write-FrontendLog `
        -Message (
            "Iniciando frontend em 0.0.0.0:" +
            "$($context.FrontendPort)."
        )

    & $npmPath run preview -- `
        --host 0.0.0.0 `
        --port $context.FrontendPort

    $exitCode = $LASTEXITCODE
} finally {
    Set-Location $previousLocation
}

if ($exitCode -ne 0) {
    throw "Processo do frontend terminou com codigo $exitCode."
}

Write-FrontendLog `
    -Level "AVISO" `
    -Message "Processo do frontend foi encerrado."

exit 0