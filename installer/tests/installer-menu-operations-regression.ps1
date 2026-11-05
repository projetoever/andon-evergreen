$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$testRoot = Join-Path $env:TEMP ("andon-menu-ops-" + [guid]::NewGuid().ToString("N"))
$watchdogFile = Join-Path $testRoot "scripts\watchdog-andon.ps1"
New-Item -Path (Split-Path $watchdogFile -Parent) -ItemType Directory -Force | Out-Null
Set-Content -Path $watchdogFile -Value '# Simulated watchdog; never executed' -Encoding ASCII

$Global:AndonInstallerVersion = "test"
$Global:AndonProjectPath = $testRoot
$Global:AndonTaskBoot = "ANDON - Boot Servicos"
$Global:AndonTaskWatchdog = "ANDON - Watchdog Servicos"
$Global:AndonTaskKiosk = "ANDON - Chrome Kiosk"
$Global:AndonChromeProfilePath = Join-Path $testRoot "chrome-profile"
$script:watchdogExitCode = 0
$script:apiReady = $false
$script:frontendReady = $false
$script:apiChecks = 0
$script:frontendChecks = 0
$script:kioskCalls = 0
$script:stoppedTasks = @()
$script:disabledTasks = @()
$script:enabledTasks = @()

# All entrypoints involving OS process/task writes are isolated mocks.
function Write-AndonHeader { param([string]$Title) }
function Write-AndonOk { param([string]$Message) }
function Write-AndonWarn { param([string]$Message) }
function Assert-AndonRuntimeScripts {}
function Enable-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    $script:enabledTasks += $TaskName
}
function Disable-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    $script:disabledTasks += $TaskName
}
function Get-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    return [pscustomobject]@{ TaskName = $TaskName; State = 'Ready' }
}
function Stop-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    $script:stoppedTasks += $TaskName
}
function Get-CimInstance {
    param([string]$ClassName, [string]$Filter, [string]$ErrorAction)
    return @()
}
function Stop-Process { throw "Stop-Process nao deveria ser chamado com 0 processos." }
function Start-Sleep { param([int]$Seconds) }
function Read-AndonYesNo { param([string]$Message, [bool]$Default); return $true }
function powershell.exe {
    $global:LASTEXITCODE = [int]$script:watchdogExitCode
}
function Wait-AndonApiBusinessReady {
    param([int]$TimeoutSeconds)
    $script:apiChecks += 1
    return [bool]$script:apiReady
}
function Wait-AndonFrontendReady {
    param([int]$TimeoutSeconds)
    $script:frontendChecks += 1
    return [bool]$script:frontendReady
}
function Invoke-AndonKioskOpen {
    $script:kioskCalls += 1
    return $true
}
function Get-AndonApiBaseUrl { return "https://localhost:3001" }
function Get-AndonFrontendUrl { return "https://localhost:8080/hub" }

. (Join-Path $repoRoot "installer\AndonInstaller.Runtime.ps1")

function Assert-SafeStartFails {
    param([string]$Message)
    $caught = ""
    try {
        Start-AndonRuntime
    } catch {
        $caught = $_.Exception.Message
    }
    if ($caught -notmatch $Message) {
        throw "Inicio deveria falhar ($Message); resultado: $caught"
    }
}

try {
    $script:watchdogExitCode = 1
    Assert-SafeStartFails -Message "Watchdog falhou"
    if ($script:apiChecks -ne 0 -or $script:kioskCalls -ne 0) {
        throw "Watchdog falhou mas API/kiosk continuaram."
    }

    $script:watchdogExitCode = 0
    $script:apiReady = $false
    Assert-SafeStartFails -Message "API nao ficou operacional"
    if ($script:kioskCalls -ne 0) {
        throw "Kiosk nao pode abrir sem API."
    }

    $script:apiReady = $true
    $script:frontendReady = $false
    Assert-SafeStartFails -Message "Frontend nao ficou acessivel"
    if ($script:kioskCalls -ne 0) {
        throw "Kiosk nao pode abrir sem frontend."
    }

    $script:frontendReady = $true
    Start-AndonRuntime
    if ($script:kioskCalls -ne 1 -or $script:apiChecks -ne 3 -or
        $script:frontendChecks -ne 2) {
        throw "Inicio valido nao executou API, frontend e kiosk na ordem esperada."
    }

    Stop-AndonRuntime -PromptAutoStart
    if ($script:stoppedTasks.Count -ne 3 -or
        $script:disabledTasks -cnotcontains $Global:AndonTaskWatchdog -or
        $script:enabledTasks -cnotcontains $Global:AndonTaskBoot -or
        $script:enabledTasks -cnotcontains $Global:AndonTaskKiosk) {
        throw "Parada temporaria nao preservou a politica original de tarefas."
    }
    Write-Host "REFINE7: watchdog/API/frontend/kiosk e parada original com mocks aprovados." -ForegroundColor Green
} finally {
    Remove-Item -Path $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
