$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "watchdog"

$postgresScript =
    Join-Path $context.ScriptsPath "start-postgres.ps1"

$apiScript =
    Join-Path $context.ScriptsPath "start-api.ps1"

$frontendScript =
    Join-Path $context.ScriptsPath "start-frontend.ps1"

$powershellPath =
    Join-Path `
        $env:SystemRoot `
        "System32\WindowsPowerShell\v1.0\powershell.exe"

if (!(Test-Path $powershellPath -PathType Leaf)) {
    $powershellPath = "powershell.exe"
}

function Write-WatchdogLog {
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

function Start-AndonDetachedRuntimeScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [Parameter(Mandatory = $true)]
        [string]$OutputLogName,

        [Parameter(Mandatory = $true)]
        [string]$ErrorLogName
    )

    if (!(Test-Path $ScriptPath -PathType Leaf)) {
        throw "Script operacional nao encontrado: $ScriptPath"
    }

    $arguments =
        "-ExecutionPolicy Bypass -NoProfile -File `"$ScriptPath`""

    Start-Process `
        -FilePath $powershellPath `
        -ArgumentList $arguments `
        -WindowStyle Hidden `
        -RedirectStandardOutput (
            Join-Path $context.LogsPath $OutputLogName
        ) `
        -RedirectStandardError (
            Join-Path $context.LogsPath $ErrorLogName
        ) |
        Out-Null
}

$mutex =
    New-Object System.Threading.Mutex(
        $false,
        "Global\ANDON_Runtime_Watchdog_1_0_0_pilot_1"
    )

$hasMutex = $false
$exitCode = 0

try {
    try {
        $hasMutex = $mutex.WaitOne(0, $false)
    } catch [System.Threading.AbandonedMutexException] {
        $hasMutex = $true
    }

    if (!$hasMutex) {
        Write-WatchdogLog `
            -Level "AVISO" `
            -Message "Outra instancia do watchdog ja esta em execucao."

        exit 0
    }

    Write-WatchdogLog `
        -Message "===== WATCHDOG ANDON INICIADO ====="

    foreach ($requiredScript in @(
        $postgresScript,
        $apiScript,
        $frontendScript
    )) {
        if (!(Test-Path $requiredScript -PathType Leaf)) {
            throw "Script operacional ausente: $requiredScript"
        }
    }

    Write-WatchdogLog `
        -Message (
            "Verificando PostgreSQL em " +
            "$($context.PostgresHost):$($context.PostgresPort)."
        )

    & $powershellPath `
        -ExecutionPolicy Bypass `
        -NoProfile `
        -File $postgresScript

    $postgresExitCode = $LASTEXITCODE

    if ($postgresExitCode -ne 0) {
        throw (
            "start-postgres.ps1 terminou com codigo " +
            "$postgresExitCode."
        )
    }

    if (
        !(
            Test-AndonRuntimeTcp `
                -HostName $context.PostgresHost `
                -Port $context.PostgresPort `
                -TimeoutMilliseconds 5000
        )
    ) {
        throw "PostgreSQL nao ficou acessivel apos a inicializacao."
    }

    Write-WatchdogLog `
        -Level "OK" `
        -Message "PostgreSQL acessivel."

    if (Test-AndonRuntimeApiBusinessReady) {
        Write-WatchdogLog `
            -Level "OK" `
            -Message "API operacional."
    } else {
        Write-WatchdogLog `
            -Level "AVISO" `
            -Message "API indisponivel. Solicitando inicializacao."

        Start-AndonDetachedRuntimeScript `
            -ScriptPath $apiScript `
            -OutputLogName "api-output.log" `
            -ErrorLogName "api-error.log"

        if (
            !(
                Wait-AndonRuntimeApiBusinessReady `
                    -TimeoutSeconds 180 `
                    -IntervalSeconds 3
            )
        ) {
            throw "API nao ficou operacional no tempo esperado."
        }

        Write-WatchdogLog `
            -Level "OK" `
            -Message "API iniciada e operacional."
    }

    if (
        Test-AndonRuntimeHttp `
            -Url $context.FrontendUrl `
            -TimeoutSeconds 5
    ) {
        Write-WatchdogLog `
            -Level "OK" `
            -Message "Frontend operacional."
    } else {
        Write-WatchdogLog `
            -Level "AVISO" `
            -Message "Frontend indisponivel. Solicitando inicializacao."

        Start-AndonDetachedRuntimeScript `
            -ScriptPath $frontendScript `
            -OutputLogName "frontend-output.log" `
            -ErrorLogName "frontend-error.log"

        if (
            !(
                Wait-AndonRuntimeHttp `
                    -Url $context.FrontendUrl `
                    -TimeoutSeconds 150 `
                    -IntervalSeconds 3
            )
        ) {
            throw "Frontend nao ficou operacional no tempo esperado."
        }

        Write-WatchdogLog `
            -Level "OK" `
            -Message "Frontend iniciado e operacional."
    }

    Write-WatchdogLog `
        -Level "OK" `
        -Message "===== WATCHDOG ANDON FINALIZADO ====="
} catch {
    $exitCode = 1

    try {
        Write-WatchdogLog `
            -Level "ERRO" `
            -Message $_.Exception.Message
    } catch {
        Write-Error $_.Exception.Message
    }
} finally {
    if ($hasMutex) {
        try {
            $mutex.ReleaseMutex()
        } catch {
        }
    }

    $mutex.Dispose()
}

exit $exitCode