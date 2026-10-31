$ErrorActionPreference = "Stop"
$errors = @()
$tokens = $null
$containerHelperPath = Join-Path $PSScriptRoot "Test-AndonHttpsDockerContainerExists.ps1"
$scripts = @(
    (Join-Path $PSScriptRoot "Start-AndonHttpsHomologation.ps1"),
    (Join-Path $PSScriptRoot "Stop-AndonHttpsHomologation.ps1"),
    $containerHelperPath
)

foreach ($script in $scripts) {
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $script,
        [ref]$tokens,
        [ref]$errors
    )
}

if ($errors.Count -gt 0) {
    throw ($errors | ForEach-Object { $_.Message } | Out-String)
}

$start = Get-Content $scripts[0] -Raw
foreach ($required in @(
    'ANDON_CENTRAL_ACCESS_ENABLED = "1"',
    'ANDON_ACCESS_ORIGIN = $origin',
    'CORS_ORIGINS = $origin',
    'ANDON_TLS_CERT = $certPath',
    'ANDON_TLS_KEY = $keyPath',
    '127.0.0.1:${PostgresPort}:5432',
    'mkcert.exe -install',
    'if ($seedRequired)',
    'Add-Member -NotePropertyName "initialized" -NotePropertyValue $true -Force'
)) {
    if (!$start.Contains($required)) { throw "Controle ausente no launcher: $required" }
}

$stop = Get-Content $scripts[1] -Raw
if (!$stop.Contains('Docker nao encontrado. Os dados e as credenciais locais foram preservados.')) {
    throw "A remocao deve preservar credenciais quando o Docker estiver indisponivel."
}

if ($start -match 'NODE_TLS_REJECT_UNAUTHORIZED|ignoreHTTPSErrors|rejectUnauthorized') {
    throw "O launcher nao pode desabilitar a validacao TLS."
}

# Docker's "no such container" error on inspect becomes terminating on
# Windows PowerShell 5.1 with ErrorActionPreference=Stop. The list-based
# helper must handle absent, stopped and renamed containers without relying
# on a throwing inspect. Use a mock instead of touching real Docker.
$helperSource = Get-Content $containerHelperPath -Raw
if (!$helperSource.Contains("docker.exe container ls -a --format") -or
    !$helperSource.Contains('$names -ccontains $ContainerName') -or
    $start.Contains("docker.exe container inspect") -or
    $stop.Contains("docker.exe container inspect")) {
    throw "Consultas Docker devem usar listagem exata, nunca inspect para verificar ausencia."
}
foreach ($source in @($start, $stop)) {
    if (!$source.Contains('Test-AndonHttpsDockerContainerExists -ContainerName $containerName')) {
        throw "Launcher e encerramento devem consultar container com helper seguro."
    }
}
. $containerHelperPath
$priorDockerExit = $global:LASTEXITCODE
try {
    function docker.exe {
        $global:LASTEXITCODE = $script:mockDockerExit
        return $script:mockDockerNames
    }
    $script:mockDockerExit = 0
    $script:mockDockerNames = @()
    if (Test-AndonHttpsDockerContainerExists -ContainerName "andon-https-hml-postgres") {
        throw "Container inexistente identificado incorretamente."
    }
    $script:mockDockerNames = @("andon-https-hml-postgres-backup-20261031")
    if (Test-AndonHttpsDockerContainerExists -ContainerName "andon-https-hml-postgres") {
        throw "Backup renomeado nao pode ser confundido com container original."
    }
    $script:mockDockerNames = @("andon-https-hml-postgres", "andon-https-hml-postgres-backup-20261031")
    if (!(Test-AndonHttpsDockerContainerExists -ContainerName "andon-https-hml-postgres")) {
        throw "Container com nome exato nao foi encontrado."
    }
    $script:mockDockerExit = 1
    $failureDetected = $false
    try {
        [void](Test-AndonHttpsDockerContainerExists -ContainerName "andon-https-hml-postgres")
    } catch {
        if ($_.Exception.Message -notmatch "Nao foi possivel consultar") { throw }
        $failureDetected = $true
    }
    if (!$failureDetected) {
        throw "Falha do daemon Docker nao deve ser tratada como container ausente."
    }
} finally {
    $global:LASTEXITCODE = $priorDockerExit
}




# UX-12 has an independent gate. Operational opt-in must never
# implicitly enable it or inherit a parent-shell value.
foreach ($required in @(
    '[switch]$EnableGlobalPaletteWrites',
    '$visualPaletteFlag = "ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED"',
    'if ($EnableGlobalPaletteWrites -and !$EnableCentralOperationalWrites)',
    ') + $centralHomologationFlags + @($visualPaletteFlag)',
    '$visualPaletteFlag, $(if ($EnableGlobalPaletteWrites) { "1" } else { "0" }), "Process")',
    'isolatedGlobalPaletteWrites = [bool]$EnableGlobalPaletteWrites',
    'SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")'
)) {
    if (!$start.Contains($required)) {
        throw "Isolamento de escrita global ausente no launcher: $required"
    }
}

# SEC-04: require the exact tested set of central write gates, never an
# undisclosed privilege, physical event, siren, or legacy credential bypass.
$requiredCentralGates = @(
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
$match = [regex]::Match($start, '(?s)\$centralHomologationFlags = @\((.*?)\)')
if (!$match.Success) { throw "Lista de permissoes de homologacao nao encontrada." }
$actualFlags = @([regex]::Matches($match.Groups[1].Value, '"(ANDON_CENTRAL_[A-Z_]+)"') |
    ForEach-Object { $_.Groups[1].Value })
if ($actualFlags.Count -ne $requiredCentralGates.Count) {
    throw "Lista de flags central incompleta ou com rotas adicionais."
}
foreach ($flag in $requiredCentralGates) {
    if ($actualFlags -notcontains $flag) {
        throw "Flag de homologacao obrigatoria ausente: $flag"
    }
}
foreach ($flag in $actualFlags) {
    if ($requiredCentralGates -notcontains $flag) {
        throw "Flag nao autorizada no teste operacional: $flag"
    }
}
foreach ($guard in @(
    '[switch]$EnableCentralOperationalWrites',
    '$environmentNames = @(',
    ') + $centralHomologationFlags',
    'foreach ($flag in $centralHomologationFlags)',
    'if ($EnableCentralOperationalWrites)',
    ' "1" } else { "0" }',
    'SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")',
    '127.0.0.1:${PostgresPort}:5432',
    '$databaseName = "andon_https_hml"',
    '$containerName = "andon-https-hml-postgres"',
    'Portas produtivas nao permitidas'
)) {
    if (!$start.Contains($guard)) { throw "Controle isolado obrigatorio ausente: $guard" }
}
$forbiddenOperationalGates = @(
    "ANDON_CENTRAL_FAILURE_EVENTS_HTTP_ENABLED",
    "ANDON_CENTRAL_DASHBOARD_SOUND_HTTP_ENABLED",
    "ANDON_CENTRAL_LEGACY_CREDENTIALS_HTTP_ENABLED"
)
foreach ($flag in $forbiddenOperationalGates) {
    if ($actualFlags -contains $flag) {
        throw "O perfil de homologacao nao pode ativar: $flag"
    }
}

# This opt-in combination must fail BEFORE Docker, files or external tools.
$paletteOnlyBlocked = $false
try {
    & $scripts[0] -EnableGlobalPaletteWrites | Out-Null
} catch {
    if ($_.Exception.Message -notmatch "paleta global requer") {
        throw "Paleta global isolada bloqueada por motivo inesperado: $($_.Exception.Message)"
    }
    $paletteOnlyBlocked = $true
}
if (!$paletteOnlyBlocked) {
    throw "Escrita de paleta habilitada sem opt-in operacional isolado."
}

# Exercise port isolation without requiring Docker, npm, mkcert or the API.
# The port guard is deliberately before any external command or filesystem work.
$startScript = $scripts[0]
foreach ($ports in @(
    @{ FrontendPort = 8080; ApiPort = 3443; PostgresPort = 55432 },
    @{ FrontendPort = 8443; ApiPort = 3001; PostgresPort = 55432 },
    @{ FrontendPort = 8443; ApiPort = 3443; PostgresPort = 5432 },
    @{ FrontendPort = 8443; ApiPort = 8443; PostgresPort = 55432 }
)) {
    $blocked = $false
    try {
        & $startScript -EnableCentralOperationalWrites -EnableGlobalPaletteWrites @ports | Out-Null
    } catch {
        if ($_.Exception.Message -notmatch "Portas") {
            throw "O teste saiu por motivo diferente da guarda de portas: $($_.Exception.Message)"
        }
        $blocked = $true
    }
    if (!$blocked) { throw "Porta insegura nao bloqueada pela homologacao." }
}

Write-Host "Scripts HTTPS de homologacao: sintaxe e controles basicos aprovados."
