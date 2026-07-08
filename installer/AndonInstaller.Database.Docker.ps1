$ErrorActionPreference = "Stop"

function Get-AndonDocker {
    $docker = Get-AndonCommandPath "docker.exe" "Instale/abra o Docker Desktop."
    & $docker version *> $null
    if ($LASTEXITCODE -ne 0) { throw "Docker instalado, mas nao respondeu. Abra o Docker Desktop e tente novamente." }
    Write-AndonOk "Docker respondeu."
    return $docker
}

function Test-AndonDockerObject {
    param([string]$DockerPath, [ValidateSet("container", "volume")][string]$ObjectType, [string]$ObjectName)
    Invoke-AndonNativeSafe { & $DockerPath $ObjectType inspect $ObjectName 1>$null 2>$null } | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Wait-AndonDockerPostgresReady {
    param([string]$DockerPath, [int]$TimeoutSeconds = 120)
    Write-Host ""
    Write-Host "Aguardando PostgreSQL Docker ficar pronto..." -ForegroundColor DarkCyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Invoke-AndonNativeSafe { & $DockerPath exec $Global:AndonDockerContainer pg_isready -U $Global:AndonDatabaseUser -d $Global:AndonDatabaseName 1>$null 2>$null } | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-AndonOk "PostgreSQL Docker pronto."; return }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "PostgreSQL Docker nao ficou pronto em $TimeoutSeconds segundos."
}

function Initialize-AndonDockerDatabase {
    Write-AndonHeader "POSTGRESQL VIA DOCKER - RECOMENDADO"
    $docker = Get-AndonDocker
    $containerExists = Test-AndonDockerObject -DockerPath $docker -ObjectType "container" -ObjectName $Global:AndonDockerContainer
    $mappedPort = $null
    if ($containerExists) { $mappedPort = Get-AndonMappedDockerPort $Global:AndonDockerContainer }
    $defaultPort = if ($mappedPort) { $mappedPort } elseif (Test-AndonPortInUse 5432) { 5433 } else { 5432 }
    $postgresPort = Read-AndonPort "Porta do PostgreSQL Docker exposta no host" $defaultPort
    if ($containerExists) {
        Write-AndonWarn "Container existente detectado: $Global:AndonDockerContainer"
        if ($mappedPort -and $mappedPort -ne $postgresPort) { Write-AndonWarn "Container existente esta mapeado na porta $mappedPort. A config usara essa porta."; $postgresPort = $mappedPort }
        if (!(Read-AndonYesNo "Usar container existente e preservar volume/dados?" $true)) { throw "Instalacao interrompida para evitar perda de dados. Use desinstalacao limpa para remover container/volume." }
        Invoke-AndonProcess $docker @("start", $Global:AndonDockerContainer) "" "Nao foi possivel iniciar o container $Global:AndonDockerContainer."
        Write-AndonOk "Container existente iniciado/preservado."
    } else {
        Write-AndonOk "Container ainda nao existe. Sera criado: $Global:AndonDockerContainer"
        $volumeExists = Test-AndonDockerObject -DockerPath $docker -ObjectType "volume" -ObjectName $Global:AndonDockerVolume
        if (!$volumeExists) { Invoke-AndonProcess $docker @("volume", "create", $Global:AndonDockerVolume) "" "Falha ao criar volume Docker $Global:AndonDockerVolume." } else { Write-AndonOk "Volume existente: $Global:AndonDockerVolume" }
        Invoke-AndonProcess $docker @("run", "--name", $Global:AndonDockerContainer, "-e", "POSTGRES_USER=$Global:AndonDatabaseUser", "-e", "POSTGRES_PASSWORD=$Global:AndonDatabasePassword", "-e", "POSTGRES_DB=$Global:AndonDatabaseName", "-v", "$Global:AndonDockerVolume`:/var/lib/postgresql/data", "-p", "$postgresPort`:5432", "-d", $Global:AndonDockerImage) "" "Falha ao criar container Docker $Global:AndonDockerContainer."
        Write-AndonOk "Container criado: $Global:AndonDockerContainer"
    }
    Wait-AndonDockerPostgresReady -DockerPath $docker
    $envLines = @(& $docker container inspect $Global:AndonDockerContainer --format "{{range .Config.Env}}{{println .}}{{end}}" 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel inspecionar variaveis do container $Global:AndonDockerContainer." }
    $pgUser = ($envLines | Where-Object { $_ -like "POSTGRES_USER=*" } | Select-Object -First 1) -replace "^POSTGRES_USER=", ""
    $pgDb = ($envLines | Where-Object { $_ -like "POSTGRES_DB=*" } | Select-Object -First 1) -replace "^POSTGRES_DB=", ""
    if ($pgUser -ne $Global:AndonDatabaseUser) { throw "Container usa POSTGRES_USER=$pgUser, esperado $Global:AndonDatabaseUser." }
    if ($pgDb -ne $Global:AndonDatabaseName) { throw "Container usa POSTGRES_DB=$pgDb, esperado $Global:AndonDatabaseName." }
    $config = Get-AndonDefaultConfig
    $config.databaseMode = "docker"
    $config.postgresHost = "127.0.0.1"
    $config.postgresPort = [int]$postgresPort
    $config.databaseName = $Global:AndonDatabaseName
    $config.databaseUser = $Global:AndonDatabaseUser
    $config.databasePassword = $Global:AndonDatabasePassword
    $config.apiPort = $Global:AndonApiPort
    $config.frontendPort = $Global:AndonFrontendPort
    $config.projectPath = $Global:AndonProjectPath
    $config.toolsPath = $Global:AndonToolsPath
    $config.dockerContainer = $Global:AndonDockerContainer
    $config.dockerVolume = $Global:AndonDockerVolume
    Save-AndonConfig $config
    Write-AndonOk "Banco Docker validado."
    return $config
}

function Remove-AndonDockerDatabaseClean {
    $config = Import-AndonConfig
    if ($config.databaseMode -ne "docker") { Write-AndonWarn "databaseMode nao e docker. Nada sera removido no Docker."; return }
    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (!$dockerCommand) { Write-AndonWarn "docker.exe nao encontrado. Container/volume Docker nao foram alterados."; return }
    $docker = $dockerCommand.Source
    & $docker version *> $null
    if ($LASTEXITCODE -ne 0) { Write-AndonWarn "Docker nao respondeu. Abra o Docker Desktop se quiser remover container/volume."; return }
    Write-AndonWarn "Modo Docker detectado."
    Write-AndonWarn "Container: $Global:AndonDockerContainer"
    Write-AndonWarn "Volume:    $Global:AndonDockerVolume"
    if (!(Confirm-AndonTyped -Message "Para remover container Docker, digite APAGAR_DOCKER." -Expected "APAGAR_DOCKER")) { Write-AndonWarn "Container/volume Docker preservados."; return }
    if (Test-AndonDockerObject -DockerPath $docker -ObjectType "container" -ObjectName $Global:AndonDockerContainer) {
        & $docker rm -f $Global:AndonDockerContainer
        if ($LASTEXITCODE -eq 0) { Write-AndonOk "Container removido: $Global:AndonDockerContainer" } else { Write-AndonWarn "Falha ao remover container. Continuando." }
    } else { Write-AndonWarn "Container nao existia: $Global:AndonDockerContainer" }
    if (!(Confirm-AndonTyped -Message "Para remover o volume persistente de dados, digite APAGAR_VOLUME." -Expected "APAGAR_VOLUME")) { Write-AndonWarn "Volume preservado."; return }
    if (Test-AndonDockerObject -DockerPath $docker -ObjectType "volume" -ObjectName $Global:AndonDockerVolume) {
        & $docker volume rm $Global:AndonDockerVolume
        if ($LASTEXITCODE -eq 0) { Write-AndonOk "Volume removido: $Global:AndonDockerVolume" } else { Write-AndonWarn "Volume nao foi removido, possivelmente esta em uso. Continuando sem falhar." }
    } else { Write-AndonWarn "Volume nao existia: $Global:AndonDockerVolume. Considerando etapa concluida." }
}
