$ErrorActionPreference = "Stop"

$script:AndonRuntimeContext = $null

function Get-AndonRuntimeConfigPath {
    if (![string]::IsNullOrWhiteSpace($env:ANDON_CONFIG_PATH)) {
        return $env:ANDON_CONFIG_PATH
    }

    return "C:\web-andon-industrial\andon-config.json"
}

function Get-AndonRuntimeContext {
    if ($null -ne $script:AndonRuntimeContext) {
        return $script:AndonRuntimeContext
    }

    $configPath = Get-AndonRuntimeConfigPath

    if (!(Test-Path $configPath -PathType Leaf)) {
        throw "Configuracao global nao encontrada: $configPath"
    }

    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
    } catch {
        throw "Falha ao ler configuracao global: $($_.Exception.Message)"
    }

    $requiredFields = @(
        "databaseMode",
        "postgresHost",
        "postgresPort",
        "databaseName",
        "databaseUser",
        "databasePassword",
        "apiPort",
        "frontendPort",
        "projectPath",
        "toolsPath"
    )

    foreach ($field in $requiredFields) {
        if (
            $null -eq $config.$field -or
            [string]::IsNullOrWhiteSpace("$($config.$field)")
        ) {
            throw "Campo obrigatorio ausente no andon-config.json: $field"
        }
    }

    $databaseMode = "$($config.databaseMode)".Trim().ToLowerInvariant()

    if ($databaseMode -notin @("local", "docker")) {
        throw "databaseMode invalido: $databaseMode"
    }

    $postgresPort = 0
    $apiPort = 0
    $frontendPort = 0

    if (
        ![int]::TryParse(
            "$($config.postgresPort)",
            [ref]$postgresPort
        ) -or
        $postgresPort -lt 1 -or
        $postgresPort -gt 65535
    ) {
        throw "postgresPort invalido."
    }

    if (
        ![int]::TryParse(
            "$($config.apiPort)",
            [ref]$apiPort
        ) -or
        $apiPort -lt 1 -or
        $apiPort -gt 65535
    ) {
        throw "apiPort invalido."
    }

    if (
        ![int]::TryParse(
            "$($config.frontendPort)",
            [ref]$frontendPort
        ) -or
        $frontendPort -lt 1 -or
        $frontendPort -gt 65535
    ) {
        throw "frontendPort invalido."
    }

    $projectPath = "$($config.projectPath)".Trim()
    $toolsPath = "$($config.toolsPath)".Trim()

    $dockerContainer = if (
        $null -ne $config.dockerContainer -and
        ![string]::IsNullOrWhiteSpace("$($config.dockerContainer)")
    ) {
        "$($config.dockerContainer)".Trim()
    } else {
        "andon-postgres"
    }

    $dockerVolume = if (
        $null -ne $config.dockerVolume -and
        ![string]::IsNullOrWhiteSpace("$($config.dockerVolume)")
    ) {
        "$($config.dockerVolume)".Trim()
    } else {
        "andon-postgres-data"
    }

    $script:AndonRuntimeContext = [pscustomobject]@{
        ConfigPath        = $configPath
        DatabaseMode     = $databaseMode
        PostgresHost      = "$($config.postgresHost)".Trim()
        PostgresPort      = $postgresPort
        DatabaseName      = "$($config.databaseName)".Trim()
        DatabaseUser      = "$($config.databaseUser)".Trim()
        DatabasePassword  = "$($config.databasePassword)"
        ApiPort           = $apiPort
        FrontendPort      = $frontendPort
        ProjectPath       = $projectPath
        ToolsPath         = $toolsPath
        ScriptsPath       = Join-Path $projectPath "scripts"
        LogsPath          = Join-Path $projectPath "logs"
        ChromeProfilePath = Join-Path $projectPath "chrome-profile"
        DockerContainer   = $dockerContainer
        DockerVolume      = $dockerVolume
        ApiBaseUrl        = "http://127.0.0.1:$apiPort"
        FrontendUrl       = "http://127.0.0.1:$frontendPort"
    }

    return $script:AndonRuntimeContext
}

function Write-AndonRuntimeLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Component,

        [Parameter(Mandatory = $true)]
        [string]$Message,

        [ValidateSet("INFO", "OK", "AVISO", "ERRO")]
        [string]$Level = "INFO"
    )

    $context = Get-AndonRuntimeContext

    New-Item `
        -ItemType Directory `
        -Path $context.LogsPath `
        -Force |
        Out-Null

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"

    Write-Host $line

    $safeComponent =
        $Component -replace '[^a-zA-Z0-9_-]', '-'

    Add-Content `
        -Path (Join-Path $context.LogsPath "$safeComponent.log") `
        -Value $line
}

function Test-AndonRuntimeHttp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [int]$TimeoutSeconds = 5
    )

    try {
        Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSeconds |
            Out-Null

        return $true
    } catch {
        return $false
    }
}

function Wait-AndonRuntimeHttp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [int]$TimeoutSeconds = 120,

        [int]$IntervalSeconds = 3
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        if (
            Test-AndonRuntimeHttp `
                -Url $Url `
                -TimeoutSeconds 5
        ) {
            return $true
        }

        Start-Sleep -Seconds $IntervalSeconds
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Test-AndonRuntimeApiBusinessReady {
    $context = Get-AndonRuntimeContext

    try {
        Invoke-RestMethod `
            -Uri "$($context.ApiBaseUrl)/health" `
            -TimeoutSec 5 |
            Out-Null

        Invoke-RestMethod `
            -Uri "$($context.ApiBaseUrl)/health/db" `
            -TimeoutSec 5 |
            Out-Null

        Invoke-RestMethod `
            -Uri (
                "$($context.ApiBaseUrl)" +
                "/api/machines?includeInactive=true"
            ) `
            -TimeoutSec 10 |
            Out-Null

        return $true
    } catch {
        return $false
    }
}

function Wait-AndonRuntimeApiBusinessReady {
    param(
        [int]$TimeoutSeconds = 240,
        [int]$IntervalSeconds = 3
    )

    $deadline =
        (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        if (Test-AndonRuntimeApiBusinessReady) {
            return $true
        }

        Start-Sleep -Seconds $IntervalSeconds
    } while ((Get-Date) -lt $deadline)

    return $false
}

function Test-AndonRuntimeTcp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HostName,

        [Parameter(Mandatory = $true)]
        [int]$Port,

        [int]$TimeoutMilliseconds = 3000
    )

    $client = New-Object System.Net.Sockets.TcpClient

    try {
        $asyncResult =
            $client.BeginConnect(
                $HostName,
                $Port,
                $null,
                $null
            )

        if (
            !$asyncResult.AsyncWaitHandle.WaitOne(
                $TimeoutMilliseconds,
                $false
            )
        ) {
            return $false
        }

        $client.EndConnect($asyncResult)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-AndonRuntimePortProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    return @(
        Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.OwningProcess -gt 0
            } |
            Select-Object `
                -ExpandProperty OwningProcess `
                -Unique
    )
}

function Get-AndonRuntimeProcessCommandLine {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId
    )

    $process = Get-CimInstance `
        Win32_Process `
        -Filter "ProcessId = $ProcessId" `
        -ErrorAction SilentlyContinue

    if (!$process) {
        return ""
    }

    return "$($process.CommandLine)"
}

function Stop-AndonRuntimeOwnedPortProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port,

        [Parameter(Mandatory = $true)]
        [string]$Component,

        [string[]]$ExpectedMarkers = @()
    )

    $context = Get-AndonRuntimeContext

    foreach ($processId in Get-AndonRuntimePortProcessIds -Port $Port) {
        $commandLine =
            Get-AndonRuntimeProcessCommandLine `
                -ProcessId $processId

        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            throw (
                "Porta $Port ocupada pelo PID $processId, mas nao foi " +
                "possivel identificar sua linha de comando. " +
                "O processo nao sera encerrado automaticamente."
            )
        }

        $ownedByAndon =
            $commandLine.IndexOf(
                $context.ProjectPath,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0

        if (!$ownedByAndon) {
            foreach ($marker in $ExpectedMarkers) {
                if (
                    ![string]::IsNullOrWhiteSpace($marker) -and
                    $commandLine.IndexOf(
                        $marker,
                        [System.StringComparison]::OrdinalIgnoreCase
                    ) -ge 0
                ) {
                    $ownedByAndon = $true
                    break
                }
            }
        }

        if (!$ownedByAndon) {
            throw (
                "Porta $Port ocupada por processo externo PID $processId. " +
                "O processo nao sera encerrado. Comando: $commandLine"
            )
        }

        Write-AndonRuntimeLog `
            -Component $Component `
            -Level "AVISO" `
            -Message (
                "Finalizando processo ANDON PID $processId " +
                "na porta $Port."
            )

        Stop-Process `
            -Id $processId `
            -Force `
            -ErrorAction Stop
    }
}

function Get-AndonRuntimeCommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,

        [string[]]$FallbackPaths = @()
    )

    $command =
        Get-Command `
            $CommandName `
            -ErrorAction SilentlyContinue

    if ($command) {
        return $command.Source
    }

    foreach ($fallbackPath in $FallbackPaths) {
        if (Test-Path $fallbackPath -PathType Leaf) {
            return $fallbackPath
        }
    }

    throw "Comando nao encontrado: $CommandName"
}

function Get-AndonChromePath {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $command =
        Get-Command `
            "chrome.exe" `
            -ErrorAction SilentlyContinue

    if ($command) {
        return $command.Source
    }

    return $null
}

function Stop-AndonChromeProfileProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProfilePath
    )

    $processes = @(
        Get-CimInstance `
            Win32_Process `
            -Filter "name = 'chrome.exe'" `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -like "*$ProfilePath*"
            }
    )

    foreach ($process in $processes) {
        Stop-Process `
            -Id $process.ProcessId `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Clear-AndonChromeProfileLocks {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProfilePath
    )

    if (!(Test-Path $ProfilePath -PathType Container)) {
        return
    }

    foreach ($lockName in @(
        "SingletonCookie",
        "SingletonLock",
        "SingletonSocket"
    )) {
        $lockPath = Join-Path $ProfilePath $lockName

        Remove-Item `
            -Path $lockPath `
            -Force `
            -ErrorAction SilentlyContinue
    }
}