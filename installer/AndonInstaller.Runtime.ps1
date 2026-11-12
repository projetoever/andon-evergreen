$ErrorActionPreference = "Stop"

# ==================================================
# ANDON WEB INDUSTRIAL - INSTALLER RUNTIME 1.0.0-pilot.3
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
    $api = Get-AndonApiBaseUrl
    try {
        $readiness = Invoke-RestMethod "$api/health/ready" -TimeoutSec 10
        return ($readiness.status -eq "ok" -and $readiness.ready -is [bool] -and $readiness.ready)
    } catch {
        return $false
    }
}

function Wait-AndonApiBusinessReady {
    param([int]$TimeoutSeconds = 240)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-AndonApiBusinessReady) {
            Write-AndonOk "API e schema prontos: /health/ready."
            return $true
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    Write-AndonWarn "API nao ficou operacional no tempo esperado."
    return $false
}

function Test-AndonFrontendReady {
    try {
        Invoke-WebRequest (Get-AndonFrontendUrl) -UseBasicParsing -TimeoutSec 5 | Out-Null
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
            Write-AndonOk "Frontend pronto: $(Get-AndonFrontendUrl)"
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
        & powershell.exe -ExecutionPolicy Bypass -NoProfile -File $watchdogScript
        $watchdogExitCode = $LASTEXITCODE
        if ($watchdogExitCode -ne 0) {
            throw (
                "Watchdog falhou (codigo $watchdogExitCode). " +
                "Verifique o Docker/PostgreSQL e os logs do ANDON. " +
                "Nenhum sucesso sera informado com API e frontend inativos."
            )
        }
    } else {
        Start-ScheduledTask -TaskName $Global:AndonTaskWatchdog -ErrorAction Stop
        Write-AndonOk "Watchdog solicitado."
    }

    if (!(Wait-AndonApiBusinessReady -TimeoutSeconds 300)) {
        throw (
            "API nao ficou operacional em $(Get-AndonApiBaseUrl)/health/ready. " +
            "Confira os logs do watchdog/API e o banco configurado."
        )
    }
    if (!(Wait-AndonFrontendReady -TimeoutSeconds 240)) {
        throw "Frontend nao ficou acessivel em $(Get-AndonFrontendUrl). Confira os logs do frontend."
    }
    Invoke-AndonKioskOpen | Out-Null

    foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    }

    Write-AndonOk "Inicializacao automatica habilitada."
}

function Test-AndonNodeProcessOwned {
    param(
        [string]$ExecutablePath,
        [string]$CommandLine,
        [string]$ProjectPath = $Global:AndonProjectPath,
        [string]$DedicatedNodePath = $Global:AndonNodeExePath
    )

    if (
        [string]::IsNullOrWhiteSpace($ExecutablePath) -or
        [string]::IsNullOrWhiteSpace($CommandLine) -or
        [string]::IsNullOrWhiteSpace($ProjectPath)
    ) {
        return $false
    }

    $normalizedExecutablePath =
        $ExecutablePath.Replace("/", "\").ToLowerInvariant()

    $normalizedCommandLine =
        $CommandLine.Replace("/", "\").ToLowerInvariant()

    $normalizedProjectPath =
        $ProjectPath.Replace("/", "\").TrimEnd("\").ToLowerInvariant()

    $normalizedDedicatedNodePath =
        $DedicatedNodePath.Replace("/", "\").ToLowerInvariant()

    $apiMarker =
        "$normalizedProjectPath\server\dist\server.js"

    $hasApiMarker =
        $normalizedCommandLine.Contains($apiMarker)

    $hasProjectMarker =
        $normalizedCommandLine.Contains("$normalizedProjectPath\")

    $hasViteEntrypoint =
        $normalizedCommandLine.Contains("\vite\bin\vite.js") -or
        $normalizedCommandLine.Contains("\vite\dist\node\cli.js")

    $hasCompiledFrontendMarker =
        $normalizedCommandLine.Contains(
            "$normalizedProjectPath\scripts\serve-frontend.mjs"
        )

    $hasFrontendMarker =
        $hasProjectMarker -and
        $normalizedCommandLine.Contains("\node_modules\") -and
        $hasViteEntrypoint -and
        $normalizedCommandLine -match '(^|\s)preview(\s|$)'

    $hasFrontendMarker =
        $hasFrontendMarker -or $hasCompiledFrontendMarker

    if (!$hasApiMarker -and !$hasFrontendMarker) {
        return $false
    }

    if ($normalizedExecutablePath -eq $normalizedDedicatedNodePath) {
        return $true
    }

    # Migracao: um Node global so e aceito quando a linha de comando contem
    # um caminho absoluto e um entrypoint oficial dentro do projeto ANDON.
    return $hasProjectMarker
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
            Test-AndonNodeProcessOwned `
                -ExecutablePath "$($_.ExecutablePath)" `
                -CommandLine "$($_.CommandLine)"
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
    param([switch]$Full, [switch]$ReadOnly)

    Write-AndonHeader "HEALTH CHECK ANDON $Global:AndonInstallerVersion"

    $config = Import-AndonConfig
    $hasCriticalError = $false
    $healthClock = [System.Diagnostics.Stopwatch]::StartNew()
    $stageClock = [System.Diagnostics.Stopwatch]::StartNew()
    $healthTimeout = if ($ReadOnly) { 5 } else { 10 }
    if ($ReadOnly) {
        Write-AndonOk "Diagnostico SOMENTE LEITURA: nao altera firewall, certificados, configuracoes, tarefas ou chamados."
        Write-Host "Iniciar e recuperar servicos somente pela opcao 4; configuracao HTTPS somente pela opcao 14."
    }

    Write-Host "databaseMode: $($config.databaseMode)"
    Write-Host "PostgreSQL:    $($config.postgresHost):$($config.postgresPort)"
    Write-Host "Banco:         $($config.databaseName)"
    Write-Host "API:           $($config.apiPort)"
    Write-Host "Frontend:      $($config.frontendPort)"
    Write-Host ""

    $andonNodeVersion = Get-AndonNodeRuntimeVersion
    if (Test-AndonDedicatedNodeRuntime) {
        Write-AndonOk "Node ANDON: $Global:AndonNodeExePath"
        Write-Host "Versao:     $andonNodeVersion"
    } else {
        Write-AndonFail "Node ANDON ausente ou invalido: $Global:AndonNodeExePath"
        $hasCriticalError = $true
    }

    $globalNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($globalNode) {
        $globalVersion = Get-AndonNodeRuntimeVersion -NodePath $globalNode.Source
        Write-Host "Node global (somente informativo): $($globalNode.Source) ($globalVersion)"
    } else {
        Write-Host "Node global (somente informativo): nao encontrado"
    }
    Write-Host "O Node global nao e usado quando o runtime dedicado esta disponivel."
    Write-Host ("Tempo da validacao Node: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $stageClock.Restart()

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

    Write-Host ("Tempo da validacao PostgreSQL/Docker: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $stageClock.Restart()

    foreach ($port in @($config.apiPort, $config.frontendPort, $config.postgresPort)) {
        if (Test-AndonPortInUse ([int]$port)) {
            Write-AndonOk "Porta $port em uso."
        } else {
            Write-AndonWarn "Porta $port sem listener."
        }
    }

    Write-Host ("Tempo da sondagem das portas Windows: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $stageClock.Restart()

    $api = Get-AndonApiBaseUrl
    foreach ($url in @("$api/health", "$api/health/db", "$api/health/ready")) {
        $probeTimer = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $health = Invoke-RestMethod $url -TimeoutSec $healthTimeout
            if ($url -like "*/health/db" -and $health.connected -ne $true) { throw "Banco desconectado." }
            if ($url -like "*/health/ready" -and ($health.status -ne "ok" -or $health.ready -ne $true)) { throw "Schema indisponivel." }
            $probeTimer.Stop()
            Write-AndonOk "$url | $($probeTimer.ElapsedMilliseconds) ms"
            if ($probeTimer.ElapsedMilliseconds -gt 1500) {
                Write-AndonWarn "Resposta lenta (acima de 1,5 s): avaliar carga e conectividade local."
            }
        } catch {
            $probeTimer.Stop()
            Write-AndonFail "$url | $($probeTimer.ElapsedMilliseconds) ms | falha na prontidao"
            $hasCriticalError = $true
        }
    }

    Write-Host ("Tempo das sondagens API HTTPS: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $stageClock.Restart()

    $frontendTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $frontendReady = Test-AndonFrontendReady
    $frontendTimer.Stop()
    if (!$frontendReady -and !$ReadOnly) {
        Write-AndonWarn "Frontend nao respondeu. Tentando autoheal do frontend uma vez..."
        $frontendScript = "$Global:AndonProjectPath\scripts\start-frontend.ps1"
        if (Test-Path $frontendScript) {
            Start-Process powershell.exe -WindowStyle Minimized -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$frontendScript`""
            Start-Sleep -Seconds 15
            $frontendReady = Test-AndonFrontendReady
        }
    }

    if ($frontendReady) {
        Write-AndonOk "Frontend $(Get-AndonFrontendUrl) | $($frontendTimer.ElapsedMilliseconds) ms (primeira resposta)"
        if ($frontendTimer.ElapsedMilliseconds -gt 1500) {
            Write-AndonWarn "Frontend respondeu lentamente. Avalie CPU, rede e renderizacao se for recorrente."
        }
    } else {
        Write-AndonFail "Frontend $(Get-AndonFrontendUrl) nao respondeu."
        if ($ReadOnly) {
            Write-AndonWarn "Nenhuma tentativa de reinicio foi feita. Use opcao 4 para iniciar/recuperar."
        }
        $hasCriticalError = $true
    }

    $stageClock.Restart()
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

    Write-Host ("Tempo das tarefas/Chrome kiosk: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $stageClock.Restart()

    if ($Full) {
        $accessResult = if ($ReadOnly) {
            Test-AndonApiReadOnly
        } else {
            Test-AndonApiWrite
        }
        if ($accessResult.Status -eq "FAIL") {
            $hasCriticalError = $true
        }
    }

    Write-Host ("Tempo de verificacao das permissoes: {0} ms" -f $stageClock.ElapsedMilliseconds)
    $healthClock.Stop()
    Write-Host ("Tempo total dos servicos locais (sem inventario de rede): {0} ms" -f $healthClock.ElapsedMilliseconds)

    if ($hasCriticalError) {
        if ($ReadOnly) {
            throw "Diagnostico identificou falha real de servico ou controle de acesso. Consulte os itens [FAIL] e o diagnostico HTTPS; nao execute reparo sem identificar a causa."
        }
        throw "Health check encontrou falha critica. Consulte o log e diagnostique antes de reparar."
    }
}
