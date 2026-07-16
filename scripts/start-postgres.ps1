$ErrorActionPreference = "Stop"

$commonPath =
    Join-Path $PSScriptRoot "Andon.Runtime.Common.ps1"

if (!(Test-Path $commonPath -PathType Leaf)) {
    throw "Modulo comum do runtime nao encontrado: $commonPath"
}

. $commonPath

$context = Get-AndonRuntimeContext
$component = "postgres"

function Write-PostgresLog {
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

function Wait-PostgresTcpReady {
    param([int]$TimeoutSeconds = 90)

    $deadline =
        (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        if (
            Test-AndonRuntimeTcp `
                -HostName $context.PostgresHost `
                -Port $context.PostgresPort `
                -TimeoutMilliseconds 3000
        ) {
            return $true
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    return $false
}

Write-PostgresLog `
    -Message (
        "Verificando PostgreSQL em " +
        "$($context.PostgresHost):$($context.PostgresPort) " +
        "(modo $($context.DatabaseMode))."
    )

if (
    Test-AndonRuntimeTcp `
        -HostName $context.PostgresHost `
        -Port $context.PostgresPort `
        -TimeoutMilliseconds 3000
) {
    Write-PostgresLog `
        -Level "OK" `
        -Message "PostgreSQL ja esta acessivel na porta configurada."

    exit 0
}

switch ($context.DatabaseMode) {
    "local" {
        if (
            $context.PostgresHost -notin @(
                "127.0.0.1",
                "localhost",
                "::1"
            )
        ) {
            throw (
                "Modo local configurado com host remoto: " +
                $context.PostgresHost
            )
        }

        Write-PostgresLog `
            -Message "Procurando servico PostgreSQL local."

        $postgresServices = @(
            Get-Service -ErrorAction Stop |
                Where-Object {
                    $_.Name -like "*postgres*" -or
                    $_.DisplayName -like "*postgres*"
                } |
                Sort-Object Name
        )

        if ($postgresServices.Count -eq 0) {
            throw "Nenhum servico PostgreSQL local foi encontrado."
        }

        if ($postgresServices.Count -gt 1) {
            $serviceDescription =
                $postgresServices |
                ForEach-Object {
                    "$($_.Name) [$($_.Status)]"
                }

            throw (
                "Mais de um servico PostgreSQL foi encontrado. " +
                "Nao e seguro selecionar automaticamente: " +
                ($serviceDescription -join ", ")
            )
        }

        $postgresService =
            $postgresServices[0]

        Write-PostgresLog `
            -Message (
                "Servico encontrado: $($postgresService.Name) " +
                "[$($postgresService.Status)]."
            )

        if ($postgresService.Status -ne "Running") {
            Write-PostgresLog `
                -Message "Iniciando servico PostgreSQL local."

            Start-Service `
                -Name $postgresService.Name `
                -ErrorAction Stop
        } else {
            Write-PostgresLog `
                -Message "Servico PostgreSQL local ja esta em execucao."
        }

        if (!(Wait-PostgresTcpReady -TimeoutSeconds 90)) {
            throw (
                "Servico PostgreSQL foi iniciado, mas a porta " +
                "$($context.PostgresPort) nao ficou acessivel."
            )
        }

        Write-PostgresLog `
            -Level "OK" `
            -Message "PostgreSQL local pronto."

        exit 0
    }

    "docker" {
        Write-PostgresLog `
            -Message (
                "Verificando container Docker " +
                "$($context.DockerContainer)."
            )

        $docker =
            Get-AndonRuntimeCommandPath `
                -CommandName "docker.exe"

        & $docker container inspect `
            $context.DockerContainer `
            1>$null `
            2>$null

        if ($LASTEXITCODE -ne 0) {
            throw (
                "Container Docker nao encontrado: " +
                $context.DockerContainer +
                ". Execute instalacao ou reparo."
            )
        }

        $runningState =
            & $docker inspect `
                --format "{{.State.Running}}" `
                $context.DockerContainer `
                2>$null

        if ($LASTEXITCODE -ne 0) {
            throw "Nao foi possivel consultar o estado do container."
        }

        if (
            "$runningState".Trim().ToLowerInvariant() -ne
            "true"
        ) {
            Write-PostgresLog `
                -Message "Iniciando container PostgreSQL."

            & $docker start `
                $context.DockerContainer `
                1>$null

            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao iniciar o container PostgreSQL."
            }
        } else {
            Write-PostgresLog `
                -Message "Container PostgreSQL ja esta em execucao."
        }

        if (!(Wait-PostgresTcpReady -TimeoutSeconds 90)) {
            throw (
                "Container foi iniciado, mas PostgreSQL nao respondeu em " +
                "$($context.PostgresHost):$($context.PostgresPort)."
            )
        }

        Write-PostgresLog `
            -Level "OK" `
            -Message "PostgreSQL Docker pronto."

        exit 0
    }

    default {
        throw "databaseMode nao suportado: $($context.DatabaseMode)"
    }
}