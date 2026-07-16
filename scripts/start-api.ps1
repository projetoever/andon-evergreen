$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "api-start"
$serverPath = Join-Path $context.ProjectPath "server"
$apiBuild = Join-Path $serverPath "dist\server.js"
$serverEnvPath = Join-Path $serverPath ".env"

function Write-ApiLog {
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

Write-ApiLog `
    -Message (
        "Verificando API em $($context.ApiBaseUrl)."
    )

if (Test-AndonRuntimeApiBusinessReady) {
    Write-ApiLog `
        -Level "OK" `
        -Message (
            "API ja esta operacional: health, banco e maquinas."
        )

    exit 0
}

if (!(Test-Path $serverPath -PathType Container)) {
    throw "Diretorio do backend nao encontrado: $serverPath"
}

if (!(Test-Path $apiBuild -PathType Leaf)) {
    throw (
        "Build da API nao encontrado: $apiBuild. " +
        "Execute instalacao, atualizacao ou reparo."
    )
}

if (!(Test-Path $serverEnvPath -PathType Leaf)) {
    throw (
        "Configuracao do backend nao encontrada: $serverEnvPath. " +
        "Execute instalacao ou reparo."
    )
}

if (
    !(
        Test-AndonRuntimeTcp `
            -HostName $context.PostgresHost `
            -Port $context.PostgresPort `
            -TimeoutMilliseconds 3000
    )
) {
    throw (
        "PostgreSQL nao esta acessivel em " +
        "$($context.PostgresHost):$($context.PostgresPort). " +
        "A API nao sera iniciada."
    )
}

$portProcessIds =
    Get-AndonRuntimePortProcessIds `
        -Port $context.ApiPort

if ($portProcessIds.Count -gt 0) {
    Write-ApiLog `
        -Level "AVISO" `
        -Message (
            "Porta $($context.ApiPort) ocupada, mas a API " +
            "nao passou no readiness completo."
        )

    Stop-AndonRuntimeOwnedPortProcesses `
        -Port $context.ApiPort `
        -Component $component `
        -ExpectedMarkers @(
            $apiBuild
        )

    Start-Sleep -Seconds 3
}

$nodePath =
    Get-AndonRuntimeCommandPath `
        -CommandName "node.exe" `
        -FallbackPaths @(
            "C:\Program Files\nodejs\node.exe"
        )

$previousLocation = Get-Location

try {
    Set-Location $serverPath

    $env:NODE_ENV = "production"
    $env:PORT = "$($context.ApiPort)"
    $env:HOST = "0.0.0.0"

    Write-ApiLog `
        -Message (
            "Iniciando API em 0.0.0.0:$($context.ApiPort) " +
            "com Node.js."
        )

    & $nodePath $apiBuild

    $exitCode = $LASTEXITCODE
} finally {
    Set-Location $previousLocation
}

if ($exitCode -ne 0) {
    throw "Processo da API terminou com codigo $exitCode."
}

Write-ApiLog `
    -Level "AVISO" `
    -Message "Processo da API foi encerrado."

exit 0