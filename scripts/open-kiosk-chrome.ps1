$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ChromeProfilePath = "$ProjectPath\chrome-profile"
$LogsPath = "$ProjectPath\logs"

$FrontUrl = "http://127.0.0.1:8080"
$ApiHealthUrl = "http://127.0.0.1:3001/health"
$ApiDbHealthUrl = "http://127.0.0.1:3001/health/db"
$MachinesUrl = "http://127.0.0.1:3001/api/machines?includeInactive=true"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-KioskLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\kiosk.log" -Value $line
}

function Test-Rest {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-RestMethod $Url -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-Web {
    param([string]$Url, [int]$TimeoutSec = 3)
    try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null; return $true } catch { return $false }
}

function Test-ApiOperational {
    return ((Test-Rest $ApiHealthUrl) -and (Test-Rest $ApiDbHealthUrl) -and (Test-Rest $MachinesUrl))
}

function Wait-Condition {
    param([scriptblock]$Test, [string]$Label, [int]$TimeoutSeconds = 240)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (& $Test) {
            Write-KioskLog "$Label OK."
            return $true
        }
        Write-KioskLog "$Label ainda nao esta pronto. Aguardando..."
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    Write-KioskLog "ERRO: $Label nao ficou pronto no tempo limite."
    return $false
}

function Get-AndonChromeProcess {
    Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$ChromeProfilePath*" }
}

function Get-ChromePath {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    $chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($chromeCommand) { return $chromeCommand.Source }
    return $null
}

Write-KioskLog "===== ABERTURA KIOSK ANDON - V10.6.1 ====="

if (!(Wait-Condition -Test { Test-ApiOperational } -Label "API operacional para Kiosk" -TimeoutSeconds 300)) {
    Write-KioskLog "Kiosk nao sera aberto porque a API operacional nao ficou pronta."
    exit 10
}

if (!(Wait-Condition -Test { Test-Web $FrontUrl } -Label "Frontend $FrontUrl" -TimeoutSeconds 240)) {
    Write-KioskLog "Kiosk nao sera aberto porque o frontend nao ficou pronto."
    exit 11
}

$existing = @(Get-AndonChromeProcess)
if ($existing.Count -gt 0) {
    Write-KioskLog "Chrome ANDON ja detectado. Finalizando para abrir estado limpo."
    foreach ($proc in $existing) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-KioskLog "Limpando perfil Chrome exclusivo do ANDON."
Remove-Item $ChromeProfilePath -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $ChromeProfilePath | Out-Null

$chromePath = Get-ChromePath
if ($chromePath) {
    Write-KioskLog "Chrome encontrado em: $chromePath"
    Start-Process -FilePath $chromePath -ArgumentList @(
        "--kiosk",
        "--new-window",
        $FrontUrl,
        "--user-data-dir=$ChromeProfilePath",
        "--no-first-run",
        "--disable-infobars",
        "--disable-session-crashed-bubble",
        "--disable-features=Translate,BackForwardCache",
        "--overscroll-history-navigation=0",
        "--disable-pinch",
        "--disk-cache-size=1"
    )
} else {
    Write-KioskLog "Chrome nao encontrado. Abrindo navegador padrao."
    Start-Process $FrontUrl
}

Start-Sleep -Seconds 8

$after = @(Get-AndonChromeProcess)
if ($after.Count -gt 0) {
    Write-KioskLog "Kiosk ANDON detectado apos abertura."
    exit 0
}

Write-KioskLog "FALHA: Chrome Kiosk nao detectado apos tentativa."
exit 12
