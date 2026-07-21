$ErrorActionPreference = "Stop"

# ==================================================
# ANDON WEB INDUSTRIAL - INSTALLER RUNTIME 1.0.0-pilot.2
# Runtime Windows consolidado
# ==================================================


function Assert-AndonRuntimeScripts {
    $scriptsPath = "$Global:AndonProjectPath\scripts"
    if (!(Test-Path $scriptsPath)) { New-Item -ItemType Directory -Force $scriptsPath | Out-Null }

    $required = @(
        "$scriptsPath\Andon.Runtime.Common.ps1",
        "$scriptsPath\start-postgres.ps1",
        "$scriptsPath\start-api.ps1",
        "$scriptsPath\start-frontend.ps1",
        "$scriptsPath\watchdog-andon.ps1",
        "$scriptsPath\open-kiosk-chrome.ps1"
    )

    $missing = @($required | Where-Object { !(Test-Path $_) })
    if ($missing.Count -gt 0) {
        throw "Scripts runtime ausentes: $($missing -join ', '). Execute a opcao Reparar instalacao."
    }

    Write-AndonOk "Scripts runtime $Global:AndonInstallerVersion presentes."
}

function Test-AndonKioskVisible {
    $profile = $Global:AndonChromeProfilePath
    $processes = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$profile*" }
    return [bool](@($processes).Count -gt 0)
}

function Test-AndonApiBusinessReady {
    $api = "http://127.0.0.1:$Global:AndonApiPort"
    try {
        Invoke-RestMethod "$api/health" -TimeoutSec 5 | Out-Null
        Invoke-RestMethod "$api/health/db" -TimeoutSec 5 | Out-Null
        Invoke-RestMethod "$api/api/machines?includeInactive=true" -TimeoutSec 10 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-AndonApiBusinessReady {
    param([int]$TimeoutSeconds = 240)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-AndonApiBusinessReady) {
            Write-AndonOk "API operacional: /health + /health/db + /api/machines."
            return $true
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    Write-AndonWarn "API nao ficou operacional no tempo esperado."
    return $false
}

function Test-AndonFrontendReady {
    try {
        Invoke-WebRequest "http://127.0.0.1:$Global:AndonFrontendPort" -UseBasicParsing -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Wait-AndonFrontendReady {
    param([int]$TimeoutSeconds = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-AndonFrontendReady) {
            Write-AndonOk "Frontend pronto: http://127.0.0.1:$Global:AndonFrontendPort"
            return $true
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    Write-AndonWarn "Frontend nao ficou pronto no tempo esperado."
    return $false
}

function Recreate-AndonTasks {
    Write-AndonHeader "TAREFAS AUTOMATICAS $Global:AndonInstallerVersion"

    Assert-AndonRuntimeScripts

    $watchdogScript = "$Global:AndonProjectPath\scripts\watchdog-andon.ps1"
    $kioskScript = "$Global:AndonProjectPath\scripts\open-kiosk-chrome.ps1"

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        try {
            $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            if ($existing) {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
                Write-AndonOk "Tarefa removida: $taskName"
            }
        } catch {
            Write-AndonWarn "Nao foi possivel remover tarefa $taskName. Continuando."
        }
    }

    $powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    if (!(Test-Path $powershellExe)) { $powershellExe = "powershell.exe" }

    $watchdogAction = New-ScheduledTaskAction `
        -Execute $powershellExe `
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$watchdogScript`""

    $bootTrigger = New-ScheduledTaskTrigger -AtStartup

    $watchdogTrigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 3650)

    $systemPrincipal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    $serviceSettings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $Global:AndonTaskBoot `
        -Action $watchdogAction `
        -Trigger $bootTrigger `
        -Principal $systemPrincipal `
        -Settings $serviceSettings `
        -Force | Out-Null
    Write-AndonOk "Tarefa criada: $Global:AndonTaskBoot"

    Register-ScheduledTask `
        -TaskName $Global:AndonTaskWatchdog `
        -Action $watchdogAction `
        -Trigger $watchdogTrigger `
        -Principal $systemPrincipal `
        -Settings $serviceSettings `
        -Force | Out-Null
    Write-AndonOk "Tarefa criada: $Global:AndonTaskWatchdog"

    $interactiveUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
    if ([string]::IsNullOrWhiteSpace($interactiveUser)) {
        $interactiveUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    }

    $kioskAction = New-ScheduledTaskAction `
        -Execute $powershellExe `
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$kioskScript`""

    $kioskTrigger = New-ScheduledTaskTrigger -AtLogOn

    $kioskPrincipal = New-ScheduledTaskPrincipal `
        -UserId $interactiveUser `
        -LogonType Interactive `
        -RunLevel Highest

    $kioskSettings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $Global:AndonTaskKiosk `
        -Action $kioskAction `
        -Trigger $kioskTrigger `
        -Principal $kioskPrincipal `
        -Settings $kioskSettings `
        -Force | Out-Null
    Write-AndonOk "Tarefa criada: $Global:AndonTaskKiosk para usuario $interactiveUser"

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    }

    Write-AndonOk "Tarefas automaticas $Global:AndonInstallerVersion recriadas e habilitadas."
}

function Invoke-AndonKioskOpen {
    Write-AndonHeader "CHROME KIOSK ANDON"

    if (!(Wait-AndonApiBusinessReady -TimeoutSeconds 300)) {
        Write-AndonWarn "Kiosk nao sera aberto: API operacional ainda nao esta pronta."
        return $false
    }

    if (!(Wait-AndonFrontendReady -TimeoutSeconds 240)) {
        Write-AndonWarn "Kiosk nao sera aberto: frontend ainda nao esta pronto."
        return $false
    }

    $task = Get-ScheduledTask -TaskName $Global:AndonTaskKiosk -ErrorAction SilentlyContinue
    if ($task) {
        Enable-ScheduledTask -TaskName $Global:AndonTaskKiosk -ErrorAction SilentlyContinue | Out-Null
        Write-AndonOk "Disparando tarefa: $Global:AndonTaskKiosk"
        Start-ScheduledTask -TaskName $Global:AndonTaskKiosk -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 15

        if (Test-AndonKioskVisible) {
            Write-AndonOk "Chrome Kiosk detectado via tarefa."
            return $true
        }

        Write-AndonWarn "Tarefa Kiosk nao exibiu o Chrome. Tentando abertura direta."
    }

    $scriptPath = "$Global:AndonProjectPath\scripts\open-kiosk-chrome.ps1"
    if (Test-Path $scriptPath) {
        Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$scriptPath`""
        Start-Sleep -Seconds 20
    }

    if (Test-AndonKioskVisible) {
        Write-AndonOk "Chrome Kiosk detectado via abertura direta."
        return $true
    }

    Write-AndonWarn "Chrome Kiosk ainda nao foi detectado."
    return $false
}

function Disable-AndonAutoStart {
    foreach ($taskName in @(
        $Global:AndonTaskBoot,
        $Global:AndonTaskWatchdog,
        $Global:AndonTaskKiosk
    )) {
        $task = Get-ScheduledTask `
            -TaskName $taskName `
            -ErrorAction SilentlyContinue

        if ($task) {
            Disable-ScheduledTask `
                -TaskName $taskName `
                -ErrorAction SilentlyContinue |
                Out-Null

            Write-AndonOk "Tarefa desabilitada: $taskName"
        }
    }

    Write-AndonOk "Inicializacao automatica desativada."
}

function Enable-AndonAutoStart {
    foreach ($taskName in @(
        $Global:AndonTaskBoot,
        $Global:AndonTaskWatchdog,
        $Global:AndonTaskKiosk
    )) {
        $task = Get-ScheduledTask `
            -TaskName $taskName `
            -ErrorAction SilentlyContinue

        if ($task) {
            Enable-ScheduledTask `
                -TaskName $taskName `
                -ErrorAction SilentlyContinue |
                Out-Null

            Write-AndonOk "Tarefa habilitada: $taskName"
        } else {
            Write-AndonWarn "Tarefa nao encontrada: $taskName"
        }
    }

    Write-AndonOk "Inicializacao automatica habilitada."
}
function Start-AndonRuntime {
    Write-AndonHeader "INICIANDO ANDON $Global:AndonInstallerVersion"

    Assert-AndonRuntimeScripts

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    }

    $watchdogScript = "$Global:AndonProjectPath\scripts\watchdog-andon.ps1"
    if (Test-Path $watchdogScript) {
        Write-AndonOk "Executando watchdog robusto."
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $watchdogScript
    } else {
        Start-ScheduledTask -TaskName $Global:AndonTaskWatchdog -ErrorAction SilentlyContinue
        Write-AndonOk "Watchdog solicitado."
    }

    if (Wait-AndonApiBusinessReady -TimeoutSeconds 300) {
        Wait-AndonFrontendReady -TimeoutSeconds 240 | Out-Null
        Invoke-AndonKioskOpen | Out-Null
    } else {
        Write-AndonWarn "API operacional nao ficou pronta. Kiosk nao sera aberto."
    }

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    }

    Write-AndonOk "Inicializacao automatica habilitada."
}

function Stop-AndonRuntime {
    param(
        [switch]$PromptAutoStart,
        [switch]$DisableAutoStart
    )

    Write-AndonHeader "PARADA DO ANDON"

    $keepAutoStart = $false
    if ($PromptAutoStart) {
        $keepAutoStart = Read-AndonYesNo "Manter inicializacao automatica no proximo boot?" $true
    } elseif ($DisableAutoStart) {
        $keepAutoStart = $false
    }

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        try {
            $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            if ($task) {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Write-AndonOk "Tarefa parada: $taskName"
            }
        } catch {
            Write-AndonWarn "Nao foi possivel parar tarefa $taskName. Continuando."
        }
    }

    Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$Global:AndonChromeProfilePath*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -like "*$Global:AndonProjectPath*" -or
            $_.CommandLine -like "*dist/server.js*" -or
            $_.CommandLine -like "*vite*preview*"
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Seconds 2

    if ($PromptAutoStart -and $keepAutoStart) {
        Enable-ScheduledTask -TaskName $Global:AndonTaskBoot -ErrorAction SilentlyContinue | Out-Null
        Disable-ScheduledTask -TaskName $Global:AndonTaskWatchdog -ErrorAction SilentlyContinue | Out-Null
        Enable-ScheduledTask -TaskName $Global:AndonTaskKiosk -ErrorAction SilentlyContinue | Out-Null
        Write-AndonOk "ANDON parado temporariamente."
        Write-AndonOk "Boot e Kiosk continuam habilitados para o proximo reinicio."
        Write-AndonWarn "Watchdog recorrente ficou desabilitado para nao religar o sistema agora."
    } else {
        foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
            Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
        }
        Write-AndonOk "ANDON parado e tarefas desabilitadas."
    }
}

function Invoke-AndonHealthCheck {
    param([switch]$Full)

    Write-AndonHeader "HEALTH CHECK ANDON $Global:AndonInstallerVersion"

    $config = Import-AndonConfig
    $hasCriticalError = $false

    Write-Host "databaseMode: $($config.databaseMode)"
    Write-Host "PostgreSQL:    $($config.postgresHost):$($config.postgresPort)"
    Write-Host "Banco:         $($config.databaseName)"
    Write-Host "API:           $($config.apiPort)"
    Write-Host "Frontend:      $($config.frontendPort)"

    if ($config.databaseMode -eq "docker") {
        $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
        if ($docker) {
            & $docker.Source container inspect $Global:AndonDockerContainer 1>$null 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-AndonOk "Container Docker detectado: $Global:AndonDockerContainer"
            } else {
                Write-AndonFail "Container Docker nao detectado: $Global:AndonDockerContainer"
                $hasCriticalError = $true
            }
        } else {
            Write-AndonFail "docker.exe nao encontrado para databaseMode=docker."
            $hasCriticalError = $true
        }
    } else {
        if (Test-AndonPortInUse ([int]$config.postgresPort)) {
            Write-AndonOk "PostgreSQL local escutando na porta $($config.postgresPort)."
        } else {
            Write-AndonFail "PostgreSQL local sem listener na porta $($config.postgresPort)."
            $hasCriticalError = $true
        }
    }

    foreach ($port in @($config.apiPort, $config.frontendPort, $config.postgresPort)) {
        if (Test-AndonPortInUse ([int]$port)) {
            Write-AndonOk "Porta $port em uso."
        } else {
            Write-AndonWarn "Porta $port sem listener."
        }
    }

    $api = "http://127.0.0.1:$($config.apiPort)"
    foreach ($url in @("$api/health", "$api/health/db", "$api/api/machines?includeInactive=true")) {
        try {
            Invoke-RestMethod $url -TimeoutSec 10 | Out-Null
            Write-AndonOk $url
        } catch {
            Write-AndonFail $url
            $hasCriticalError = $true
        }
    }

    if (!(Test-AndonFrontendReady)) {
        Write-AndonWarn "Frontend nao respondeu. Tentando autoheal do frontend uma vez..."
        $frontendScript = "$Global:AndonProjectPath\scripts\start-frontend.ps1"
        if (Test-Path $frontendScript) {
            Start-Process powershell.exe -WindowStyle Minimized -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$frontendScript`""
            Start-Sleep -Seconds 15
        }
    }

    if (Test-AndonFrontendReady) {
        Write-AndonOk "Frontend http://127.0.0.1:$($config.frontendPort)"
    } else {
        Write-AndonFail "Frontend http://127.0.0.1:$($config.frontendPort)"
        $hasCriticalError = $true
    }

    $tasks = Get-ScheduledTask -TaskName "ANDON*" -ErrorAction SilentlyContinue
    if ($tasks) {
        $tasks | Select-Object TaskName, State | Format-Table -AutoSize
    } else {
        Write-AndonWarn "Nenhuma tarefa ANDON encontrada."
    }

    if (Test-AndonKioskVisible) {
        Write-AndonOk "Chrome Kiosk detectado."
    } else {
        Write-AndonWarn "Chrome Kiosk nao detectado."
    }

    if ($Full) {
        if (!(Test-AndonApiWrite)) { $hasCriticalError = $true }
    }

    if ($hasCriticalError) {
        throw "Health check encontrou falha critica. Execute Iniciar ANDON ou Reparar instalacao."
    }
}
