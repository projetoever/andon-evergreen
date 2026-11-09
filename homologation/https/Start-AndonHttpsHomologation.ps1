[CmdletBinding()]
param(
    [int]$FrontendPort = 8443,
    [int]$ApiPort = 3443,
    [int]$PostgresPort = 55432,
    [switch]$EnableCentralOperationalWrites,
    [switch]$EnableGlobalPaletteWrites,
    [switch]$NotebookStandardPorts
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$statePath = Join-Path $repoRoot ".andon-homologation"
$certPath = Join-Path $statePath "localhost.pem"
$keyPath = Join-Path $statePath "localhost-key.pem"
$configPath = Join-Path $statePath "config.json"
$processPath = Join-Path $statePath "processes.json"
$containerName = "andon-https-hml-postgres"
$databaseName = "andon_https_hml"
$databaseUser = "andon_hml"
. (Join-Path $PSScriptRoot "Test-AndonHttpsDockerContainerExists.ps1")

# SEC-04 notebook-only opt-in: exclude physical downtime events, global siren,
# industrial identities, legacy passwords, and catalog-admin mutations.
$centralHomologationFlags = @(
    "ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED",
    "ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED",
    "ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED",
    "ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED",
    "ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED",
    "ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED",
    "ANDON_CENTRAL_FINISH_CALL_HTTP_ENABLED",
    "ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED",
    "ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED",
    "ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED",
    "ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED",
    "ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED",
    "ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED",
    "ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED",
    "ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED",
    # Only metadata name/OS, never machine status or production control.
    "ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED",
    "ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED",
    "ANDON_CENTRAL_PRIORITY_HTTP_ENABLED"
)
# UX-12 has a separate global-write capability. It is never inherited from
# a parent PowerShell and is never enabled by operational writes alone.
$visualPaletteFlag = "ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED"
# Only the notebook HTTPS 8080/3001 isolated Docker profile may default to
# allowing new workstation registrations. Never inherit this from the shell.
$hmlAdmissionFlag = "ANDON_HML_OPEN_NEW_WORKSTATIONS_DEFAULT"
if ($EnableGlobalPaletteWrites -and !$EnableCentralOperationalWrites) {
    throw "A paleta global requer -EnableCentralOperationalWrites no ambiente local isolado."
}
# Same familiar frontend/API ports are permitted ONLY through an explicit
# notebook-only path, never through the industrial launcher or generic profile.
# The database remains synthetic and private to localhost on port 55432.
$standardNotebookPorts = (
    $NotebookStandardPorts -and $FrontendPort -eq 8080 -and
    $ApiPort -eq 3001 -and $PostgresPort -eq 55432
)
if ($NotebookStandardPorts -and !$standardNotebookPorts) {
    throw "Portas do ambiente local invalidas. Use exclusivamente 8080, 3001 e 55432."
}
if ($NotebookStandardPorts -and !$EnableCentralOperationalWrites) {
    throw "O perfil local requer ativacao explicita das escritas centrais isoladas."
}
if ($EnableCentralOperationalWrites) {
    # This launcher always binds to localhost and uses its own Docker database.
    if (($FrontendPort -eq 8080 -or $ApiPort -eq 3001) -and !$standardNotebookPorts -or
        $PostgresPort -eq 5432) {
        throw "Portas produtivas nao permitidas no teste operacional isolado."
    }
    if ($FrontendPort -lt 1024 -or $ApiPort -lt 1024 -or $PostgresPort -lt 1024 -or
        $FrontendPort -gt 65535 -or $ApiPort -gt 65535 -or $PostgresPort -gt 65535 -or
        $FrontendPort -eq $ApiPort -or $FrontendPort -eq $PostgresPort -or $ApiPort -eq $PostgresPort) {
        throw "Portas invalidas ou duplicadas na homologacao operacional."
    }
}

if ($NotebookStandardPorts) {
    # A production Windows Server cannot opt in even if this script was copied
    # outside the factory repository. Fail before touching Docker or TLS.
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    if ([int]$os.ProductType -ne 1) {
        throw "Perfil local proibido no Windows Server. Nenhuma configuracao foi alterada."
    }
    # Never stop unknown listeners or reuse an HTTP service already running
    # on a familiar port. The operator must close the previous notebook runtime.
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    foreach ($port in @($FrontendPort, $ApiPort)) {
        if (@($listeners | Where-Object { $_.Port -eq $port }).Count -gt 0) {
            throw "Porta $port ja ocupada. Pare o ANDON anterior no ambiente local antes de iniciar HTTPS central. Nenhum processo foi encerrado."
        }
    }
}


function Require-Command([string]$Name, [string]$Guidance) {
    if (!(Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name nao encontrado. $Guidance"
    }
}

function Wait-Url([string]$Url, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch {
            Start-Sleep -Seconds 1
        }
    } while ((Get-Date) -lt $deadline)
    throw "O endereco nao ficou disponivel: $Url"
}

Require-Command "node.exe" "Instale o Node.js 22 LTS."
Require-Command "npm.cmd" "Instale o Node.js 22 LTS."
Require-Command "docker.exe" "Instale e inicie o Docker Desktop."
Require-Command "mkcert.exe" "Instale com: winget install FiloSottile.mkcert"

New-Item -ItemType Directory -Force -Path $statePath | Out-Null

if (!(Test-Path (Join-Path $repoRoot "node_modules"))) {
    & npm.cmd ci --prefix $repoRoot
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependencias do frontend." }
}
if (!(Test-Path (Join-Path $repoRoot "server\node_modules"))) {
    & npm.cmd ci --prefix (Join-Path $repoRoot "server")
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar as dependencias da API." }
}

if (Test-Path $processPath) {
    throw "A homologacao aparenta estar ativa. Execute Stop-AndonHttpsHomologation.ps1 primeiro."
}

if (!(Test-Path $certPath) -or !(Test-Path $keyPath)) {
    & mkcert.exe -install
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar a CA local confiavel do mkcert." }
    & mkcert.exe -cert-file $certPath -key-file $keyPath localhost 127.0.0.1 ::1
    if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar o certificado local." }
    & icacls.exe $keyPath "/inheritance:r" "/grant:r" "$($env:USERNAME):(R,W)" | Out-Null
}

$containerExists = Test-AndonHttpsDockerContainerExists -ContainerName $containerName
if ($containerExists) {
    if (!(Test-Path $configPath)) {
        throw "Container isolado existe sem configuracao local. Remova-o manualmente ou use Stop-AndonHttpsHomologation.ps1 -RemoveData."
    }
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    if ([int]$config.postgresPort -ne $PostgresPort) {
        throw "O banco isolado existente usa a porta $($config.postgresPort). Reinicie usando essa porta ou remova os dados isolados."
    }
    $databasePassword = [string]$config.databasePassword
    $seedRequired = $config.initialized -ne $true
    & docker.exe start $containerName | Out-Null
} else {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $databasePassword = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
    $config = [ordered]@{
        databasePassword = $databasePassword
        postgresPort = $PostgresPort
        initialized = $false
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $config | ConvertTo-Json | Set-Content -Encoding UTF8 $configPath
    & icacls.exe $configPath "/inheritance:r" "/grant:r" "$($env:USERNAME):(R,W)" | Out-Null
    & docker.exe run -d --name $containerName `
        -e "POSTGRES_USER=$databaseUser" `
        -e "POSTGRES_PASSWORD=$databasePassword" `
        -e "POSTGRES_DB=$databaseName" `
        -p "127.0.0.1:${PostgresPort}:5432" `
        postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o PostgreSQL isolado." }
    $seedRequired = $true
}

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    & docker.exe exec $containerName pg_isready -U $databaseUser -d $databaseName 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (!$ready) { throw "PostgreSQL isolado nao ficou pronto." }

$databaseUrl = "postgresql://${databaseUser}:${databasePassword}@127.0.0.1:${PostgresPort}/${databaseName}?schema=public"
$origin = "https://localhost:$FrontendPort"
$apiUrl = "https://localhost:$ApiPort"

$environmentNames = @(
    "DATABASE_URL", "ANDON_INSTALL_PROFILE", "HOST", "PORT", "NODE_ENV",
    "ANDON_TLS_CERT", "ANDON_TLS_KEY", "CORS_ORIGINS", "ANDON_ACCESS_ORIGIN",
    "ANDON_CENTRAL_ACCESS_ENABLED", "VITE_ANDON_DATA_MODE", "VITE_ANDON_API_BASE_URL",
    "ANDON_HOMOLOGATION_TLS_CERT", "ANDON_HOMOLOGATION_TLS_KEY",
    "ANDON_HOMOLOGATION_HOST", "ANDON_HOMOLOGATION_FRONTEND_PORT",
    "PLC_INTEGRATION_ENABLED", "PLC_ADAPTER", "ANDON_PROJECT_PATH", "ANDON_TLS_HOST"
) + $centralHomologationFlags + @($visualPaletteFlag, $hmlAdmissionFlag)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
$env:DATABASE_URL = $databaseUrl
$env:ANDON_INSTALL_PROFILE = "starter"
. (Join-Path $PSScriptRoot "Test-AndonPrismaClientCurrent.ps1")
$serverRoot = Join-Path $repoRoot "server"
# When a client is already generated and corresponds to the current schema,
# do not replace its locked Windows DLL on every start. The local marker is
# committed only after a successful generate or exact schema comparison.
if (!(Test-AndonPrismaClientCurrent -ServerRoot $serverRoot -StateRoot $statePath) -and
    (Test-AndonPrismaClientArtifacts -ServerRoot $serverRoot) -and
    (Test-AndonPrismaSchemaMatchesGenerated -ServerRoot $serverRoot)) {
    Save-AndonPrismaClientFingerprint -ServerRoot $serverRoot -StateRoot $statePath
}
if (Test-AndonPrismaClientCurrent -ServerRoot $serverRoot -StateRoot $statePath) {
    Write-Host "Prisma Client atual e validado. Sem regenerar DLL Windows." -ForegroundColor Green
} else {
    Write-Host "Prisma Client desatualizado: geracao necessaria." -ForegroundColor Yellow
    & npm.cmd run db:generate --prefix $serverRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar Prisma Client. Verifique processos Node locais que usam query_engine-windows.dll.node."
    }
    # Prisma's own successful generator and actual executable artifacts are
    # the postcondition, not the byte-level hash of its normalized schema.
    Save-AndonPrismaClientFingerprint -ServerRoot $serverRoot -StateRoot $statePath
}
& npm.cmd run db:migrate --prefix (Join-Path $repoRoot "server")
if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar migrations somente no banco de homologacao." }
if ($seedRequired) {
    & npm.cmd run db:seed:starter --prefix (Join-Path $repoRoot "server")
    if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar os dados isolados." }
    if ($config -is [System.Collections.IDictionary]) {
        $config["initialized"] = $true
    } else {
        $config | Add-Member -NotePropertyName "initialized" -NotePropertyValue $true -Force
    }
    $config | ConvertTo-Json | Set-Content -Encoding UTF8 $configPath
    & icacls.exe $configPath "/inheritance:r" "/grant:r" "$($env:USERNAME):(R,W)" | Out-Null
}

$env:HOST = "127.0.0.1"
$env:PORT = "$ApiPort"
$env:NODE_ENV = "development"
$env:ANDON_TLS_CERT = $certPath
$env:ANDON_TLS_KEY = $keyPath
$env:CORS_ORIGINS = $origin
$env:ANDON_ACCESS_ORIGIN = $origin
$env:ANDON_CENTRAL_ACCESS_ENABLED = "1"
# No physical PLC adapter may be inherited from server/.env or the shell.
$env:PLC_INTEGRATION_ENABLED = "0"
$env:PLC_ADAPTER = "mock"
# No accidental inheritance of feature flags from the launching shell.
# With no switch, all 15 operational write adapters are forced OFF in child processes.
# Palette writes are independently OFF even with -EnableCentralOperationalWrites.
foreach ($flag in $centralHomologationFlags) {
    [Environment]::SetEnvironmentVariable(
        $flag, $(if ($EnableCentralOperationalWrites) { "1" } else { "0" }), "Process")
}
[Environment]::SetEnvironmentVariable(
    $visualPaletteFlag, $(if ($EnableGlobalPaletteWrites) { "1" } else { "0" }), "Process")
[Environment]::SetEnvironmentVariable(
    $hmlAdmissionFlag, $(if ($standardNotebookPorts -and $EnableCentralOperationalWrites) { "1" } else { "0" }), "Process")
# Use stable, compiled Node runtimes instead of npm/vite dev wrappers.
# The old wrappers could exit or detach children after the menu script ended.
# Build every activation in the isolated profile until a versioned build cache
# is introduced; never report success for a stale source tree.
$env:VITE_ANDON_DATA_MODE = "api"
$env:VITE_ANDON_API_BASE_URL = $apiUrl
$env:ANDON_HOMOLOGATION_TLS_CERT = $certPath
$env:ANDON_HOMOLOGATION_TLS_KEY = $keyPath
$env:ANDON_HOMOLOGATION_HOST = "127.0.0.1"
$env:ANDON_HOMOLOGATION_FRONTEND_PORT = "$FrontendPort"
& npm.cmd run build --prefix $serverRoot
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar a API HTTPS local." }
& npm.cmd run build --prefix $repoRoot
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar a interface HTTPS local." }

$apiBuild = Join-Path $serverRoot "dist\server.js"
$frontendBuild = Join-Path $repoRoot "scripts\serve-frontend.mjs"
if (!(Test-Path $apiBuild -PathType Leaf) -or
    !(Test-Path (Join-Path $repoRoot "dist\server\server.js") -PathType Leaf) -or
    !(Test-Path (Join-Path $repoRoot "dist\client") -PathType Container)) {
    throw "Compilacao nao produziu a API e o Hub. Nenhum servico sera iniciado."
}
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$apiProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"' + $apiBuild + '"') `
    -WorkingDirectory $serverRoot -PassThru `
    -RedirectStandardOutput (Join-Path $statePath "api.log") `
    -RedirectStandardError (Join-Path $statePath "api-error.log")

# API and frontend are separate Node child processes. Start-Process captures
# the process environment at spawn time, so the API already has PORT=$ApiPort.
# Explicitly assign the frontend port before spawning it; otherwise both
# children inherit PORT=$ApiPort and race to bind 127.0.0.1:3001.
$env:PORT = "$FrontendPort"
$env:ANDON_PROJECT_PATH = $repoRoot
$env:ANDON_TLS_HOST = "localhost"
$frontendProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"' + $frontendBuild + '"') `
    -WorkingDirectory $repoRoot -PassThru `
    -RedirectStandardOutput (Join-Path $statePath "frontend.log") `
    -RedirectStandardError (Join-Path $statePath "frontend-error.log")

@{
    apiPid = $apiProcess.Id
    frontendPid = $frontendProcess.Id
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    isolatedCentralWrites = [bool]$EnableCentralOperationalWrites
    notebookStandardPorts = [bool]$NotebookStandardPorts
    isolatedGlobalPaletteWrites = [bool]$EnableGlobalPaletteWrites
} | ConvertTo-Json | Set-Content -Encoding UTF8 $processPath

try {
    Wait-Url "$apiUrl/health"
    Wait-Url "$origin/hub"
    Start-Sleep -Seconds 3
    if ($apiProcess.HasExited -or $frontendProcess.HasExited) {
        throw "API ou interface encerrou logo apos iniciar. Consulte .andon-homologation/api-error.log e frontend-error.log."
    }
    Wait-Url "$apiUrl/health"
    Wait-Url "$origin/hub"
} catch {
    & (Join-Path $PSScriptRoot "Stop-AndonHttpsHomologation.ps1")
    throw
}
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
    }
}

Write-Host ""
Write-Host "ANDON HTTPS de homologacao pronto:" -ForegroundColor Green
if ($NotebookStandardPorts) { Write-Host "  AMBIENTE LOCAL: HTTPS central nas portas habituais 8080/3001; SEM acesso ao banco industrial." -ForegroundColor Yellow }
Write-Host "  Hub: $origin/hub"
Write-Host "  API: $apiUrl"
Write-Host "  Banco: PostgreSQL isolado em 127.0.0.1:$PostgresPort"
Write-Host "  Primeiro acesso central: no Hub local, cadastre uma unica senha Admin (SEM senha predefinida)."
Write-Host "  Escritas centrais isoladas: $(if ($EnableCentralOperationalWrites) { 'ATIVAS PARA TESTES' } else { 'DESLIGADAS (padrao)' })"
Write-Host "  Paleta global (escrita): $(if ($EnableGlobalPaletteWrites) { 'ATIVA APENAS NO AMBIENTE LOCAL' } else { 'DESLIGADA (padrao, independente)' })"
Write-Host "  Eventos fisicos, sirene global e credenciais antigas: NAO LIBERADOS."
Write-Host "  Encerrar: .\homologation\https\Stop-AndonHttpsHomologation.ps1"
