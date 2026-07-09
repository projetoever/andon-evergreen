$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$LogsPath = "$ProjectPath\logs"
$ConfigPath = "$BasePath\andon-config.json"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\postgres.log" -Value $line
}

function Read-AndonConfigSafe {
    if (Test-Path $ConfigPath) {
        try { return Get-Content $ConfigPath -Raw | ConvertFrom-Json } catch {}
    }
    return [pscustomobject]@{
        databaseMode = "local"
        postgresHost = "127.0.0.1"
        postgresPort = 5433
        databaseName = "andon_db"
        databaseUser = "andon"
        databasePassword = "andon_dev_password"
        dockerContainer = "andon-postgres"
    }
}

function Test-PortReady {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Wait-PortReady {
    param([int]$Port, [int]$TimeoutSeconds = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-PortReady -Port $Port) { return $true }
        Write-Log "Porta $Port ainda nao esta pronta. Aguardando..."
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    return $false
}

$config = Read-AndonConfigSafe
$mode = if ($config.databaseMode) { "$($config.databaseMode)" } else { "local" }
$port = if ($config.postgresPort) { [int]$config.postgresPort } else { 5433 }

Write-Log "===== POSTGRESQL ANDON - START V10.6.1 ====="
Write-Log "databaseMode=$mode postgres=$($config.postgresHost):$port"

if ($mode -eq "docker") {
    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (!$dockerCommand) {
        Write-Log "ERRO: docker.exe nao encontrado para databaseMode=docker."
        exit 1
    }

    $docker = $dockerCommand.Source
    $container = if ($config.dockerContainer) { "$($config.dockerContainer)" } else { "andon-postgres" }
    $dbUser = if ($config.databaseUser) { "$($config.databaseUser)" } else { "andon" }
    $dbName = if ($config.databaseName) { "$($config.databaseName)" } else { "andon_db" }

    $deadline = (Get-Date).AddSeconds(240)
    do {
        & $docker info 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { break }
        Write-Log "Docker ainda nao respondeu. Aguardando..."
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    & $docker info 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO: Docker nao respondeu."
        exit 2
    }

    & $docker container inspect $container 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERRO: container Docker nao encontrado: $container"
        exit 3
    }

    & $docker update --restart unless-stopped $container 1>$null 2>$null

    $running = & $docker inspect -f "{{.State.Running}}" $container 2>$null
    if ("$running".Trim().ToLowerInvariant() -ne "true") {
        Write-Log "Iniciando container $container..."
        & $docker start $container 1>$null 2>$null
    }

    $deadline = (Get-Date).AddSeconds(240)
    do {
        & $docker exec $container pg_isready -U $dbUser -d $dbName 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "PostgreSQL Docker pronto."
            exit 0
        }
        Write-Log "PostgreSQL Docker ainda nao esta pronto. Aguardando..."
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    Write-Log "ERRO: PostgreSQL Docker nao ficou pronto."
    exit 4
}

if (Test-PortReady -Port $port) {
    Write-Log "PostgreSQL local ja esta escutando na porta $port."
    exit 0
}

Write-Log "PostgreSQL local nao esta escutando. Tentando iniciar servico..."

$pgServices = @(Get-Service -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -like "*postgres*" -or $_.DisplayName -like "*postgres*"
} | Sort-Object Name)

foreach ($service in $pgServices) {
    Write-Log "Servico PostgreSQL encontrado: $($service.Name) / Status: $($service.Status)"
    if ($service.Status -ne "Running") {
        try {
            Start-Service -Name $service.Name -ErrorAction Stop
            Write-Log "Servico iniciado: $($service.Name)"
        } catch {
            Write-Log "Nao foi possivel iniciar $($service.Name): $($_.Exception.Message)"
        }
    }
}

if (Wait-PortReady -Port $port -TimeoutSeconds 180) {
    Write-Log "PostgreSQL local pronto na porta $port."
    exit 0
}

Write-Log "ERRO: PostgreSQL local nao ficou pronto na porta $port."
exit 5
