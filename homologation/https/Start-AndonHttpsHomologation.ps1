[CmdletBinding()]
param(
    [int]$FrontendPort = 8443,
    [int]$ApiPort = 3443,
    [int]$PostgresPort = 55432,
    [switch]$EnableCentralOperationalWrites,
    [switch]$EnableGlobalPaletteWrites
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
    "ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED",
    "ANDON_CENTRAL_PRIORITY_HTTP_ENABLED"
)
# UX-12 has a separate global-write capability. It is never inherited from
# a parent PowerShell and is never enabled by operational writes alone.
$visualPaletteFlag = "ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED"
if ($EnableGlobalPaletteWrites -and !$EnableCentralOperationalWrites) {
    throw "A paleta global requer -EnableCentralOperationalWrites no notebook isolado."
}
if ($EnableCentralOperationalWrites) {
    # This launcher always binds to localhost and uses its own Docker database.
    if ($FrontendPort -eq 8080 -or $ApiPort -eq 3001 -or $PostgresPort -eq 5432) {
        throw "Portas produtivas nao permitidas no teste operacional isolado."
    }
    if ($FrontendPort -lt 1024 -or $ApiPort -lt 1024 -or $PostgresPort -lt 1024 -or
        $FrontendPort -gt 65535 -or $ApiPort -gt 65535 -or $PostgresPort -gt 65535 -or
        $FrontendPort -eq $ApiPort -or $FrontendPort -eq $PostgresPort -or $ApiPort -eq $PostgresPort) {
        throw "Portas invalidas ou duplicadas na homologacao operacional."
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

& docker.exe container inspect $containerName 1>$null 2>$null
$containerExists = $LASTEXITCODE -eq 0
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
    "ANDON_HOMOLOGATION_HOST", "ANDON_HOMOLOGATION_FRONTEND_PORT"
) + $centralHomologationFlags + @($visualPaletteFlag)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
$env:DATABASE_URL = $databaseUrl
$env:ANDON_INSTALL_PROFILE = "starter"
& npm.cmd run db:generate --prefix (Join-Path $repoRoot "server")
if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar o Prisma Client." }
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
# No accidental inheritance of feature flags from the launching shell.
# With no switch, all 15 operational write adapters are forced OFF in child processes.
# Palette writes are independently OFF even with -EnableCentralOperationalWrites.
foreach ($flag in $centralHomologationFlags) {
    [Environment]::SetEnvironmentVariable(
        $flag, $(if ($EnableCentralOperationalWrites) { "1" } else { "0" }), "Process")
}
[Environment]::SetEnvironmentVariable(
    $visualPaletteFlag, $(if ($EnableGlobalPaletteWrites) { "1" } else { "0" }), "Process")
$apiProcess = Start-Process npm.cmd -ArgumentList "run", "dev" `
    -WorkingDirectory (Join-Path $repoRoot "server") -PassThru `
    -RedirectStandardOutput (Join-Path $statePath "api.log") `
    -RedirectStandardError (Join-Path $statePath "api-error.log")

$env:VITE_ANDON_DATA_MODE = "api"
$env:VITE_ANDON_API_BASE_URL = $apiUrl
$env:ANDON_HOMOLOGATION_TLS_CERT = $certPath
$env:ANDON_HOMOLOGATION_TLS_KEY = $keyPath
$env:ANDON_HOMOLOGATION_HOST = "127.0.0.1"
$env:ANDON_HOMOLOGATION_FRONTEND_PORT = "$FrontendPort"
$frontendProcess = Start-Process npm.cmd -ArgumentList "run", "dev" `
    -WorkingDirectory $repoRoot -PassThru `
    -RedirectStandardOutput (Join-Path $statePath "frontend.log") `
    -RedirectStandardError (Join-Path $statePath "frontend-error.log")

@{
    apiPid = $apiProcess.Id
    frontendPid = $frontendProcess.Id
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    isolatedCentralWrites = [bool]$EnableCentralOperationalWrites
    isolatedGlobalPaletteWrites = [bool]$EnableGlobalPaletteWrites
} | ConvertTo-Json | Set-Content -Encoding UTF8 $processPath

try {
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
Write-Host "  Hub: $origin/hub"
Write-Host "  API: $apiUrl"
Write-Host "  Banco: PostgreSQL isolado em 127.0.0.1:$PostgresPort"
Write-Host "  Primeiro acesso local: crie a senha Admin global (SEM senha predefinida)."
Write-Host "  Escritas centrais isoladas: $(if ($EnableCentralOperationalWrites) { 'ATIVAS PARA TESTES' } else { 'DESLIGADAS (padrao)' })"
Write-Host "  Paleta global (escrita): $(if ($EnableGlobalPaletteWrites) { 'ATIVA APENAS NO NOTEBOOK' } else { 'DESLIGADA (padrao, independente)' })"
Write-Host "  Eventos fisicos, sirene global e credenciais antigas: NAO LIBERADOS."
Write-Host "  Encerrar: .\homologation\https\Stop-AndonHttpsHomologation.ps1"
