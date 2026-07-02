$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ChromeProfilePath = "$ProjectPath\chrome-profile"
$LogsPath = "$ProjectPath\logs"
$FrontUrl = "http://localhost:8080"

New-Item -ItemType Directory -Force $ChromeProfilePath | Out-Null
New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\kiosk.log" -Value $line
}

function Test-Http {
    param([string]$Url)
    try {
        Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Log "Aguardando frontend em $FrontUrl..."

for ($i = 1; $i -le 60; $i++) {
    if (Test-Http $FrontUrl) {
        Write-Log "Frontend disponivel."
        break
    }
    Start-Sleep -Seconds 2
}

$chromePath = $null

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

foreach ($candidate in $chromeCandidates) {
    if (Test-Path $candidate) {
        $chromePath = $candidate
        break
    }
}

if (-not $chromePath) {
    $chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($chromeCommand) { $chromePath = $chromeCommand.Source }
}

Write-Log "Encerrando somente Chrome associado ao perfil ANDON..."

$andonChromeProcesses = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$ChromeProfilePath*" }

foreach ($proc in $andonChromeProcesses) {
    Write-Log "Finalizando Chrome ANDON PID $($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

if ($chromePath) {
    Write-Log "Chrome encontrado em: $chromePath"
    Write-Log "Abrindo ANDON em modo kiosk."

    Start-Process $chromePath -ArgumentList @(
        "--kiosk",
        $FrontUrl,
        "--no-first-run",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-features=Translate",
        "--user-data-dir=$ChromeProfilePath"
    )
} else {
    Write-Log "Chrome nao encontrado. Abrindo navegador padrao."
    Start-Process $FrontUrl
}
