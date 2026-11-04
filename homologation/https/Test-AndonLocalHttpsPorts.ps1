$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Clear-AndonLocalHttpsPorts.ps1")

# All process, TCP and scheduled-task observations are mocked. No real service
# or task on the CI runner is touched.
$root = 'C:\web-andon-industrial\andon'
$script:processes = @{}
$script:stopped = @()
$script:taskCount = 0
$script:taskStopCount = 0
$script:tasksEnabled = $false
$script:reusedPid = $false
$script:queried = 0
$tempState = Join-Path $env:TEMP ("andon-test-ports-" + [guid]::NewGuid().ToString("N"))
New-Item -Path $tempState -ItemType Directory -Force | Out-Null
$stamp = [datetime]::UtcNow.AddMinutes(-1)
function Make-Owner([string]$name, [string]$cmd, [int]$pidNumber) {
    return [pscustomobject]@{
        ProcessId = $pidNumber
        Name = $name
        ExecutablePath = 'C:\web-andon-industrial\runtime\node\node.exe'
        CommandLine = $cmd
        CreationDate = $stamp
    }
}
function Get-NetTCPConnection {
    param([int]$LocalPort, [string]$State, [string]$ErrorAction)
    foreach ($key in @($script:processes.Keys)) {
        $p = $script:processes[$key]
        if (($LocalPort -eq 3001 -and $key -eq 7001) -or
            ($LocalPort -eq 8080 -and $key -eq 7002)) {
            [pscustomobject]@{ OwningProcess = $key; LocalPort = $LocalPort }
        }
    }
}
function Get-CimInstance {
    param([string]$ClassName, [string]$Filter, [string]$ErrorAction)
    if ($ClassName -eq "Win32_OperatingSystem") { return [pscustomobject]@{ ProductType = 1 } }
    if ($ClassName -ne "Win32_Process") { throw "Class inesperada: $ClassName" }
    $id = [int](($Filter -split '=')[1].Trim())
    $p = $script:processes[$id]
    if ($null -ne $p -and $script:reusedPid -and $script:queried -gt 0) {
        $copy = $p.PSObject.Copy()
        $copy.CreationDate = $stamp.AddHours(1)
        return $copy
    }
    $script:queried += 1
    return $p
}
function Stop-Process {
    param([int]$Id, [switch]$Force, [string]$ErrorAction)
    $script:stopped += $Id
    $script:processes.Remove($Id)
}
function Get-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    if (!$script:tasksEnabled) { return $null }
    return [pscustomobject]@{
        State = "Ready"
        Actions = @([pscustomobject]@{
            Execute = "powershell.exe"
            Arguments = "-File C:\web-andon-industrial\andon\scripts\watchdog-andon.ps1"
        })
    }
}
function Stop-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    $script:taskStopCount += 1
}
function Disable-ScheduledTask {
    param([string]$TaskName, [string]$ErrorAction)
    $script:taskCount += 1
}
function Start-Sleep {
    param([int]$Seconds)
}

try {
    # Unrelated listener: preflight rejects before attempting any stop.
    $script:processes[7001] = Make-Owner "node.exe" '"C:\OtherApp\server.js"' 7001
    $rejected = $false
    try { Clear-AndonLocalHttpsPorts -ProjectRoot $root -StateRoot $tempState } catch {
        if ($_.Exception.Message -notmatch "sem vinculo verificavel") { throw }
        $rejected = $true
    }
    if (!$rejected -or $script:stopped.Count -ne 0) {
        throw "Servico alheio foi alterado na porta 3001."
    }

    # Valid local API and frontend are stopped; verified tasks are suspended.
    $script:processes[7001] = Make-Owner "node.exe" '"C:\web-andon-industrial\runtime\node\node.exe" "C:\web-andon-industrial\andon\server\dist\server.js"' 7001
    $script:processes[7002] = Make-Owner "node.exe" '"C:\web-andon-industrial\runtime\node\node.exe" "C:\web-andon-industrial\andon\scripts\serve-frontend.mjs"' 7002
    $script:tasksEnabled = $true
    Clear-AndonLocalHttpsPorts -ProjectRoot $root -StateRoot $tempState
    if ($script:stopped.Count -ne 2 -or $script:taskCount -ne 3) {
        throw "API, frontend ou tarefas oficiais nao foram suspensas."
    }
    $snapshot = Join-Path $tempState "previous-standard-runtime-tasks.json"
    if (!(Test-Path $snapshot)) { throw "Estado anterior das tarefas nao foi preservado." }
    $snapshotContent = Get-Content $snapshot -Raw
    Clear-AndonLocalHttpsPorts -ProjectRoot $root -StateRoot $tempState
    if ((Get-Content $snapshot -Raw) -cne $snapshotContent) {
        throw "Atualizacao posterior alterou o snapshot original."
    }

    # PID reuse between detection and stop must not touch another process.
    $script:tasksEnabled = $false
    $script:processes[7001] = Make-Owner "node.exe" '"C:\web-andon-industrial\andon\server\dist\server.js"' 7001
    $script:reusedPid = $true
    $script:queried = 0
    $oldCount = $script:stopped.Count
    $rejected = $false
    try { Clear-AndonLocalHttpsPorts -ProjectRoot $root -StateRoot $tempState } catch {
        if ($_.Exception.Message -notmatch "reutilizado") { throw }
        $rejected = $true
    }
    if (!$rejected -or $script:stopped.Count -ne $oldCount) {
        throw "PID reutilizado recebeu Stop-Process."
    }
} finally {
    Remove-Item -Path $tempState -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($name in @("Get-NetTCPConnection","Get-CimInstance","Stop-Process","Get-ScheduledTask","Stop-ScheduledTask","Disable-ScheduledTask","Start-Sleep")) {
        Remove-Item ("Function:\" + $name) -ErrorAction SilentlyContinue
    }
}
Write-Host "Transicao HTTPS 8080/3001: processo alheio bloqueado, runtime local e tarefas suspensos, PID reutilizado protegido." -ForegroundColor Green
