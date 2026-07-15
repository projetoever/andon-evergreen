$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "kiosk"

function Write-KioskLog {
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

function Test-AndonKioskProcess {
    $processes = @(
        Get-CimInstance `
            Win32_Process `
            -Filter "name = 'chrome.exe'" `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -like
                    "*$($context.ChromeProfilePath)*"
            }
    )

    return ($processes.Count -gt 0)
}

Write-KioskLog `
    -Message "Aguardando API operacional."

if (
    !(
        Wait-AndonRuntimeApiBusinessReady `
            -TimeoutSeconds 300 `
            -IntervalSeconds 3
    )
) {
    throw "Kiosk nao sera aberto: API nao ficou operacional."
}

Write-KioskLog `
    -Level "OK" `
    -Message "API operacional."

Write-KioskLog `
    -Message (
        "Aguardando frontend em $($context.FrontendUrl)."
    )

if (
    !(
        Wait-AndonRuntimeHttp `
            -Url $context.FrontendUrl `
            -TimeoutSeconds 240 `
            -IntervalSeconds 3
    )
) {
    throw "Kiosk nao sera aberto: frontend indisponivel."
}

Write-KioskLog `
    -Level "OK" `
    -Message "Frontend operacional."

$chromePath = Get-AndonChromePath

if ([string]::IsNullOrWhiteSpace($chromePath)) {
    throw (
        "Google Chrome nao encontrado. " +
        "O kiosk nao sera aberto em navegador alternativo."
    )
}

New-Item `
    -ItemType Directory `
    -Path $context.ChromeProfilePath `
    -Force |
    Out-Null

Write-KioskLog `
    -Message "Encerrando somente o Chrome do perfil ANDON."

Stop-AndonChromeProfileProcesses `
    -ProfilePath $context.ChromeProfilePath

Start-Sleep -Seconds 2

Clear-AndonChromeProfileLocks `
    -ProfilePath $context.ChromeProfilePath

Write-KioskLog `
    -Message "Abrindo Chrome em modo kiosk."

Start-Process `
    -FilePath $chromePath `
    -ArgumentList @(
        "--kiosk",
        $context.FrontendUrl,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-features=Translate",
        "--user-data-dir=$($context.ChromeProfilePath)"
    ) |
    Out-Null

$deadline = (Get-Date).AddSeconds(30)

do {
    if (Test-AndonKioskProcess) {
        Write-KioskLog `
            -Level "OK" `
            -Message "Chrome Kiosk detectado."

        exit 0
    }

    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

throw "Chrome foi solicitado, mas o processo kiosk nao foi detectado."