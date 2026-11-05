$ErrorActionPreference = "Stop"
$errors = @()
$tokens = $null
$containerHelperPath = Join-Path $PSScriptRoot "Test-AndonHttpsDockerContainerExists.ps1"
$scripts = @(
    (Join-Path $PSScriptRoot "Start-AndonHttpsHomologation.ps1"),
    (Join-Path $PSScriptRoot "Stop-AndonHttpsHomologation.ps1"),
    $containerHelperPath,
    (Join-Path $PSScriptRoot "..\..\ATUALIZAR_NOTEBOOK.ps1"),
    (Join-Path $PSScriptRoot "Stop-AndonHttpsTrackedProcess.ps1"),
    (Join-Path $PSScriptRoot "Test-AndonHttpsTrackedProcess.ps1"),
    (Join-Path $PSScriptRoot "Clear-AndonLocalHttpsPorts.ps1"),
    (Join-Path $PSScriptRoot "Test-AndonLocalHttpsPorts.ps1"),
    (Join-Path $PSScriptRoot "Test-AndonPrismaClientCurrent.ps1"),
    (Join-Path $PSScriptRoot "Test-AndonPrismaClientFreshness.ps1")
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

& $scripts[9]
$start = Get-Content $scripts[0] -Raw
# The API and frontend must bind distinct ports. In PowerShell Start-Process,
# both children inherit PORT at their own spawn time. Changing PORT only
# after both have started recreates the intermittent EADDRINUSE:3001 failure.
$apiPortAssignment = $start.IndexOf('$env:PORT = "$ApiPort"')
$apiSpawn = $start.IndexOf('$apiProcess = Start-Process')
$frontendPortAssignment = $start.IndexOf('$env:PORT = "$FrontendPort"')
$frontendSpawn = $start.IndexOf('$frontendProcess = Start-Process')
if ($apiPortAssignment -lt 0 -or
    $apiSpawn -le $apiPortAssignment -or
    $frontendPortAssignment -le $apiSpawn -or
    $frontendSpawn -le $frontendPortAssignment) {
    throw "Launcher HTTPS: API e frontend devem receber PORT separado ANTES de cada Start-Process."
}
if (!$start.Contains('if (Test-AndonPrismaClientCurrent -ServerRoot $serverRoot -StateRoot $statePath)')) {
    throw "Prisma Client existente nao esta protegido contra geracao redundante e DLL em uso."
}
if (!$start.Contains('Save-AndonPrismaClientFingerprint -ServerRoot $serverRoot -StateRoot $statePath')) {
    throw "Novo Prisma Client precisa de validacao pos-geracao."
}

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
if (!$stop.Contains('Stop-AndonHttpsTrackedProcess -ProcessId')) {
    throw "Stop HTTPS deve ignorar PID obsoleto usando a guarda de identidade."
}
if ($stop.Contains('& taskkill.exe')) {
    throw "Stop HTTPS nao pode chamar taskkill diretamente sem verificar o PID."
}
& $scripts[5]
& $scripts[7]

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
    ') + $centralHomologationFlags + @($visualPaletteFlag, $hmlAdmissionFlag)',
    '$hmlAdmissionFlag = "ANDON_HML_OPEN_NEW_WORKSTATIONS_DEFAULT"',
    '$hmlAdmissionFlag, $(if ($standardNotebookPorts -and $EnableCentralOperationalWrites) { "1" } else { "0" }), "Process")',
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

# Behavioral regression in a child PowerShell process: all task/process
# operations are mocked so CI never touches the local runtime.
$menuOperationsTest = Join-Path $PSScriptRoot "..\..\installer\tests\installer-menu-operations-regression.ps1"
if (!(Test-Path $menuOperationsTest -PathType Leaf)) {
    throw "Teste comportamental das opcoes 4 e 5 ausente."
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $menuOperationsTest
if ($LASTEXITCODE -ne 0) {
    throw "Regressao do fluxo operacional 4/5 (watchdog, API, frontend, kiosk, tarefas)."
}

# Regression: the main menu must run the established industrial
# watchdog/kiosk/task scripts, not select a separate HTTPS launcher because
# a local test config file happens to exist.
$notebookScript = Get-Content $scripts[3] -Raw
foreach ($required in @(
    'Get-CimInstance Win32_OperatingSystem',
    'if ([int]$os.ProductType -ne 1)',
    'git.exe pull --ff-only origin main',
    'Test-Path $stateFile',
    'menu-andon-installer.ps1',
    'AndonInstaller.Runtime.ps1',
    'start-andon.ps1',
    'stop-andon.ps1',
    'health-check-andon.ps1',
    'Get-FileHash',
    'Encerre o menu antigo e abra-o novamente'
)) {
    if (!$notebookScript.Contains($required)) {
        throw "O atualizador local deve restaurar e sincronizar o runtime oficial: $required"
    }
}
$menuPath = Join-Path $PSScriptRoot "..\..\installer\menu-andon-installer.ps1"
$menu = Get-Content $menuPath -Raw
foreach ($required in @(
    '$Global:AndonInstallerPath\update-andon-server.ps1',
    '$Global:AndonInstallerPath\start-andon.ps1',
    '$Global:AndonInstallerPath\stop-andon.ps1',
    '$Global:AndonInstallerPath\health-check-andon.ps1',
    '$Global:AndonInstallerPath\configure-andon-https.ps1'
)) {
    if (!$menu.Contains($required)) { throw "Menu oficial sem script operacional: $required" }
}
if ($menu.Contains('Test-AndonLocalHttpsProfile') -or
    $menu.Contains('$Global:AndonProjectPath\ATUALIZAR_NOTEBOOK.ps1')) {
    throw "A opcao 2 nao pode chamar perfil de homologacao separado."
}
if ($menu -match '(?m)^\s*Write-Host\s+"15\s*-|(?m)^\s*"15"\s*\{') {
    throw "A opcao 15 deve permanecer removida."
}
$scriptContracts = @(
    @{ File = "start-andon.ps1"; Required = @('Start-AndonRuntime','Invoke-AndonHealthCheck') },
    @{ File = "stop-andon.ps1"; Required = @('Stop-AndonRuntime -PromptAutoStart') },
    @{ File = "health-check-andon.ps1"; Required = @('Invoke-AndonHealthCheck -Full') }
)
foreach ($contract in $scriptContracts) {
    $source = Get-Content (Join-Path $PSScriptRoot ("..\..\installer\" + $contract.File)) -Raw
    if ($source.Contains('Invoke-AndonLocalHttpsProfile') -or
        $source.Contains('Test-AndonLocalHttpsProfile')) {
        throw "O script $($contract.File) nao pode desviar do runtime oficial."
    }
    foreach ($required in $contract.Required) {
        if (!$source.Contains($required)) {
            throw "O script $($contract.File) nao chama a rotina original: $required"
        }
    }
}
$operationalRuntime = Get-Content (Join-Path $PSScriptRoot "..\..\installer\AndonInstaller.Runtime.ps1") -Raw
foreach ($required in @(
    'function Start-AndonRuntime',
    'function Stop-AndonRuntime',
    'Invoke-AndonKioskOpen',
    'Recreate-AndonTasks',
    'Stop-ScheduledTask',
    'Wait-AndonApiBusinessReady -TimeoutSeconds 300',
    'Wait-AndonFrontendReady -TimeoutSeconds 240',
    'if ($watchdogExitCode -ne 0)',
    'API nao ficou operacional',
    'Frontend nao ficou acessivel'
)) {
    if (!$operationalRuntime.Contains($required)) {
        throw "Runtime industrial deve preservar todos os passos e diagnostico: $required"
    }
}
if ($notebookScript -match 'RemoveData|git.exe reset --hard|Docker.*rm -f') {
    throw "Atualizador local nao pode apagar dados nem reescrever historico."
}
if ($start -match 'Start-Process npm.cmd') {
    throw "Launcher de laboratorio nao deve usar npm dev como processo persistente."
}
foreach ($required in @(
    '[switch]$NotebookStandardPorts',
    '$standardNotebookPorts = (',
    'if ($NotebookStandardPorts -and !$standardNotebookPorts)',
    'if ($NotebookStandardPorts -and !$EnableCentralOperationalWrites)',
    '$os.ProductType -ne 1',
    'GetActiveTcpListeners()',
    'PLC_INTEGRATION_ENABLED = "0"',
    'PLC_ADAPTER = "mock"',
    '127.0.0.1'
)) {
    if (!$start.Contains($required)) { throw "Launcher 8080 do notebook sem controle: $required" }
}
foreach ($parameters in @(
    @{ NotebookStandardPorts = $true; EnableCentralOperationalWrites = $true; FrontendPort = 8443; ApiPort = 3001; PostgresPort = 55432 },
    @{ NotebookStandardPorts = $true; EnableCentralOperationalWrites = $true; FrontendPort = 8080; ApiPort = 3443; PostgresPort = 55432 },
    @{ NotebookStandardPorts = $true; EnableCentralOperationalWrites = $true; FrontendPort = 8080; ApiPort = 3001; PostgresPort = 5432 },
    @{ NotebookStandardPorts = $true; FrontendPort = 8080; ApiPort = 3001; PostgresPort = 55432 }
)) {
    $blocked = $false
    try { & $scripts[0] @parameters | Out-Null } catch {
        if ($_.Exception.Message -notmatch "Portas|requer ativacao") { throw }
        $blocked = $true
    }
    if (!$blocked) { throw "Porta ou perfil inseguro aceito no notebook." }
}

# S6: validate backup/restore script safety without running Docker, dumps or
# changing the notebook. The real roundtrip is opt-in after launcher shutdown.
$backupRestoreScript = Join-Path $PSScriptRoot "Test-AndonHttpsBackupRestore.ps1"
$backupTokens = $null
$backupErrors = @()
[void][System.Management.Automation.Language.Parser]::ParseFile(
    $backupRestoreScript, [ref]$backupTokens, [ref]$backupErrors
)
if ($backupErrors.Count -gt 0) {
    throw ($backupErrors | ForEach-Object { $_.Message } | Out-String)
}
$backupSource = Get-Content $backupRestoreScript -Raw
foreach ($required in @(
    '$containerName = "andon-https-hml-postgres"',
    '$databaseName = "andon_https_hml"',
    '$databaseUser = "andon_hml"',
    'if (Test-Path $processPath)',
    'Test-AndonHttpsDockerContainerExists -ContainerName $containerName',
    'npipe:////./pipe/',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
    '@127.0.0.1:$($config.postgresPort)/$($Database)?schema=public',
    'Get-BiParitySnapshot',
    'SetEnvironmentVariable($name, $previous[$name], "Process")',
    'POSTGRES_DB=$databaseName',
    'POSTGRES_USER=$databaseUser',
    '$exposure[0].HostIp -ne "127.0.0.1"',
    '--format=custom',
    'Get-FileHash -Algorithm SHA256',
    'sha256sum $containerDump',
    'docker.exe cp $backupPath $restoreTarget',
    'createdb -U $databaseUser -T template0 $cloneName',
    'pg_restore -U $databaseUser -d $cloneName',
    'dropdb -U $databaseUser --if-exists $cloneName',
    'Get-TableFingerprint -Database $cloneName -Table $table',
    '$restoredFingerprint[$table] -ne $sourceFingerprint[$table]',
    'Get-BiParitySnapshot -Database $databaseName',
    'Get-BiParitySnapshot -Database $cloneName',
    '$sourceBiSnapshot -cne $restoredBiSnapshot',
    '"machine_production_events"',
    '"call_impact_intervals"',
    '"technician_time_allocations"',
    'biParity = [ordered]@{',
    'kpi_parity_empty_cohort',
    'icacls.exe $backupDirectory',
    'icacls.exe $backupPath',
    'icacls.exe $manifestPath',
    'if ($startedByScript)'
)) {
    if (!$backupSource.Contains($required)) {
        throw "Backup/restore sem controle de isolamento obrigatorio: $required"
    }
}
# A JSON array returned by docker inspect must be flattened before
# exact comparison in Windows PowerShell 5.1 (never print DB password).
if (!$backupSource.Contains('foreach ($entry in ($envJson | ConvertFrom-Json))') -or
    $backupSource.Contains('$containerEnv = @($envJson | ConvertFrom-Json)')) {
    throw "Backup/restore deve enumerar o array Docker de forma compativel com PowerShell 5.1."
}
$fakeEnvJson = '["POSTGRES_DB=andon_https_hml","POSTGRES_USER=andon_hml","POSTGRES_PASSWORD=unused-fixture"]'
$fakeEnv = [string[]]@()
foreach ($entry in ($fakeEnvJson | ConvertFrom-Json)) {
    if ($entry -isnot [string]) { throw "Array Docker inesperado." }
    $fakeEnv += $entry
}
if ($fakeEnv -notcontains "POSTGRES_DB=andon_https_hml" -or
    $fakeEnv -notcontains "POSTGRES_USER=andon_hml" -or
    $fakeEnv -contains "POSTGRES_DB=andon_db") {
    throw "Regressao: identidade Docker de LAB nao identificada corretamente."
}
$biScript = Join-Path $PSScriptRoot "..\..\server\scripts\bi-restore-parity-snapshot.mjs"
$biScript = [System.IO.Path]::GetFullPath($biScript)
$biSource = Get-Content $biScript -Raw
foreach ($required in @(
    'analyticsEligibility(catalog)',
    'buildExecutiveOverview({',
    'buildPlannedProductionKpis({',
    'buildCausalEpisodes(failureEvents,',
    'summarizeCausalDowntime(causalEpisodes,',
    'ANDON_HML_BI_COMPARE',
    'ANDON_INTEGRATION_TEST',
    '127.0.0.1',
    'refine5-s6-bi-parity-v1'
)) {
    if (!$biSource.Contains($required)) {
        throw "O comparador BI nao usa os calculos oficiais ou nao esta isolado: $required"
    }
}

foreach ($forbidden in @(
    'pg_restore -U $databaseUser -d $databaseName',
    'dropdb -U $databaseUser --if-exists $databaseName',
    'docker.exe rm -f $containerName',
    'pg_dump -d postgres',
    'pg_restore -U $databaseUser -d postgres'
)) {
    if ($backupSource.Contains($forbidden)) {
        throw "Backup/restore contem comando ou fonte de dados nao permitida: $forbidden"
    }
}

Write-Host "Scripts HTTPS de homologacao: sintaxe e controles basicos aprovados."
