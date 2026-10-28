$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "frontend-start"
$clientBuildPath = Join-Path $context.ProjectPath "dist\client"
$serverBuildPath = Join-Path $context.ProjectPath "dist\server\server.js"
$frontendServerPath = Join-Path $context.ProjectPath "scripts\serve-frontend.mjs"

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

if (!(Test-Path $clientBuildPath -PathType Container)) {
    throw (
        "Build do frontend nao encontrado: $clientBuildPath. " +
        "Execute instalacao, atualizacao ou reparo."
    )
}
if (!(Test-Path $serverBuildPath -PathType Leaf)) {
    throw "Build SSR do frontend nao encontrado: $serverBuildPath"
}
if (!(Test-Path $frontendServerPath -PathType Leaf)) {
    throw "Servidor do frontend compilado nao encontrado: $frontendServerPath"
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
            $frontendServerPath
        )

    Start-Sleep -Seconds 3
}

$nodePath = $context.NodePath
Enable-AndonRuntimeNodeEnvironment

$previousLocation = Get-Location

try {
    Set-Location $context.ProjectPath

    $env:NODE_ENV = "production"
    $env:HOST = "0.0.0.0"
    $env:PORT = "$($context.FrontendPort)"
    $env:ANDON_PROJECT_PATH = $context.ProjectPath

    if ($context.TransportMode -eq "https") {
        $env:ANDON_TLS_CERT = $context.TlsCertificatePath
        $env:ANDON_TLS_KEY = $context.TlsPrivateKeyPath
        $env:ANDON_TLS_HOST = $context.HttpsHost
    } else {
        Remove-Item Env:\ANDON_TLS_CERT -ErrorAction SilentlyContinue
        Remove-Item Env:\ANDON_TLS_KEY -ErrorAction SilentlyContinue
        Remove-Item Env:\ANDON_TLS_HOST -ErrorAction SilentlyContinue
    }

    Write-FrontendLog `
        -Message (
            "Iniciando frontend compilado " +
            "$($context.TransportMode.ToUpperInvariant()) em 0.0.0.0:" +
            "$($context.FrontendPort) com Node ANDON: $nodePath."
        )

    & $nodePath $frontendServerPath

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
