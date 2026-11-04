# Transition the existing local ANDON runtime to the HTTPS test profile.
# This helper is only called AFTER the Windows-client guard in
# ATUALIZAR_NOTEBOOK.ps1. It never touches the database or production host.

function Get-AndonLocalPortOwner {
    param([Parameter(Mandatory = $true)][int]$Port)
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($ownerPid in @($connections | Where-Object { $_.OwningProcess -gt 0 } |
        Select-Object -ExpandProperty OwningProcess -Unique)) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction Stop
        if ($null -ne $process) {
            [pscustomobject]@{
                Port = $Port
                Pid = [int]$ownerPid
                Name = [string]$process.Name
                ExecutablePath = [string]$process.ExecutablePath
                CommandLine = [string]$process.CommandLine
                CreationDate = [datetime]$process.CreationDate
            }
        }
    }
}

function Test-AndonLocalPortOwner {
    param(
        [Parameter(Mandatory = $true)]$Owner,
        [Parameter(Mandatory = $true)][string]$ProjectRoot
    )
    if ($Owner.Name -ine "node.exe") { return $false }
    $cmd = ([string]$Owner.CommandLine).Replace("/", "\").ToLowerInvariant()
    $exe = ([string]$Owner.ExecutablePath).Replace("/", "\").ToLowerInvariant()
    $root = $ProjectRoot.Replace("/", "\").TrimEnd("\").ToLowerInvariant()
    $dedicated = (Join-Path (Split-Path $root -Parent) "runtime\node\node.exe").ToLowerInvariant()
    $hasProject = $cmd.Contains("$root\")
    $hasApi = ($cmd.Contains("$root\server\dist\server.js") -or
        $cmd.Contains("$root\server\src\server.ts"))
    $hasFrontend = ($cmd.Contains("$root\scripts\serve-frontend.mjs") -or
        ($hasProject -and ($cmd.Contains("\vite\bin\vite.js") -or
            $cmd.Contains("\vite\dist\node\cli.js"))))
    # A dedicated Node runtime may have an absolute executable but a relative
    # server entrypoint; this is allowed only for ANDON's dedicated executable.
    if ($exe -eq $dedicated) {
        $hasApi = $hasApi -or $cmd -match '(?i)(?:^|\s|")dist\\server\.js(?:\s|"|$)'
        $hasFrontend = $hasFrontend -or $cmd -match '(?i)(?:^|\s|")scripts\\serve-frontend\.mjs(?:\s|"|$)'
    }
    if ($Owner.Port -eq 3001) { return $hasApi }
    if ($Owner.Port -eq 8080) { return $hasFrontend }
    return $false
}

function Suspend-AndonLocalStartupTasks {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string]$StateRoot
    )
    $names = @("ANDON - Boot Servicos", "ANDON - Watchdog Servicos", "ANDON - Chrome Kiosk")
    $snapshotPath = Join-Path $StateRoot "previous-standard-runtime-tasks.json"
    $tasks = @()
    foreach ($name in $names) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($null -eq $task) { continue }
        $actions = @($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" })
        $expected = [string]($actions -join " ")
        if ($expected.IndexOf($ProjectRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Tarefa $name nao aponta para a instalacao local do ANDON; nenhuma tarefa sera desabilitada."
        }
        $tasks += [pscustomobject]@{
            name = $name
            wasEnabled = ([string]$task.State -ne "Disabled")
        }
    }
    if ($tasks.Count -eq 0) { return }
    if (!(Test-Path $StateRoot)) { New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null }
    if (!(Test-Path $snapshotPath)) {
        # Never replace the original state on subsequent test updates.
        @($tasks) | ConvertTo-Json -Depth 3 | Set-Content -Path $snapshotPath -Encoding UTF8
    }
    foreach ($entry in $tasks) {
        Stop-ScheduledTask -TaskName $entry.name -ErrorAction SilentlyContinue
        Disable-ScheduledTask -TaskName $entry.name -ErrorAction Stop | Out-Null
    }
    Write-Host "Tarefas locais ANDON suspensas para evitar reinicio HTTP durante os testes HTTPS."
    Write-Host "Estado anterior registrado em .andon-homologation/previous-standard-runtime-tasks.json."
}

function Clear-AndonLocalHttpsPorts {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string]$StateRoot
    )
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    if ([int]$os.ProductType -ne 1) {
        throw "Transicao de portas 8080/3001 proibida no Windows Server."
    }

    $owners = @()
    foreach ($port in @(3001, 8080)) { $owners += @(Get-AndonLocalPortOwner -Port $port) }
    if ($owners.Count -eq 0) { return }

    # Preflight EVERY listener before stopping even one service.
    foreach ($owner in $owners) {
        if (!(Test-AndonLocalPortOwner -Owner $owner -ProjectRoot $ProjectRoot)) {
            throw "Porta $($owner.Port) ocupada pelo PID $($owner.Pid) ($($owner.Name)), sem vinculo verificavel com o ANDON local. Nenhum processo foi encerrado."
        }
    }

    Suspend-AndonLocalStartupTasks -ProjectRoot $ProjectRoot -StateRoot $StateRoot
    foreach ($owner in $owners) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.Pid)" -ErrorAction Stop
        if ($null -eq $current) { continue }
        if (([datetime]$current.CreationDate).ToUniversalTime() -ne
            $owner.CreationDate.ToUniversalTime()) {
            throw "PID $($owner.Pid) foi reutilizado durante a transicao; processo preservado."
        }
        Stop-Process -Id $owner.Pid -Force -ErrorAction Stop
        Write-Host "ANDON local anterior na porta $($owner.Port) encerrado (PID $($owner.Pid))."
    }

    # No silent retries against unknown processes or scheduled-task restarts.
    Start-Sleep -Seconds 2
    foreach ($port in @(3001, 8080)) {
        $remaining = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($remaining.Count -gt 0) {
            throw "A porta $port ainda esta ocupada. Nenhum outro processo sera encerrado; confira os servicos locais e tente novamente."
        }
    }
}
