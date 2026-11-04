[CmdletBinding()]
param()

# REFINE 5 S6: restore exercise ONLY for the Docker PostgreSQL HTTPS notebook.
# Stop the launcher first, WITHOUT -RemoveData. Never accepts arbitrary DBs.
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$statePath = Join-Path $repoRoot ".andon-homologation"
$configPath = Join-Path $statePath "config.json"
$processPath = Join-Path $statePath "processes.json"
$backupDirectory = Join-Path $statePath "backups"
$containerName = "andon-https-hml-postgres"
$databaseName = "andon_https_hml"
$databaseUser = "andon_hml"
. (Join-Path $PSScriptRoot "Test-AndonHttpsDockerContainerExists.ps1")

if (Test-Path $processPath) {
    throw "Encerre o launcher HTTPS antes do backup, sem remover dados."
}
if (!(Test-Path $configPath)) {
    throw "Configuracao do notebook isolado ausente; nenhum banco externo sera acessado."
}
if (!(Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop indisponivel. Nenhum dado foi alterado."
}
if (!(Test-AndonHttpsDockerContainerExists -ContainerName $containerName)) {
    throw "Container exato de homologacao ausente. Outros containers nao serao acessados."
}
# Refuse Docker contexts targeting other machines, even if the container has
# the expected name. Windows Docker Desktop must use a local named pipe.
$dockerEndpoint = (& docker.exe context inspect --format "{{.Endpoints.docker.Host}}" | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or !$dockerEndpoint.StartsWith("npipe:////./pipe/")) {
    throw "Docker deve apontar para o Docker Desktop LOCAL (named pipe Windows)."
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json
if ($config.initialized -ne $true -or
    [int]$config.postgresPort -lt 1024 -or
    [int]$config.postgresPort -gt 65535 -or
    [int]$config.postgresPort -eq 5432) {
    throw "Configuracao isolada invalida ou banco nao inicializado."
}

# Exact container name alone is not proof. Check actual DB identity and
# loopback-only Docker binding without displaying secrets from Config.Env.
$envJson = (& docker.exe inspect --format "{{json .Config.Env}}" $containerName | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Falha ao verificar identidade do container." }
$containerEnv = @($envJson | ConvertFrom-Json)
if ($containerEnv -notcontains "POSTGRES_DB=$databaseName" -or
    $containerEnv -notcontains "POSTGRES_USER=$databaseUser") {
    throw "Este container nao e o banco isolado esperado."
}
$bindingJson = (& docker.exe inspect --format "{{json .HostConfig.PortBindings}}" $containerName | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Falha ao verificar o binding de rede." }
$bindings = $bindingJson | ConvertFrom-Json
$exposure = @($bindings."5432/tcp")
if ($exposure.Count -ne 1 -or $exposure[0].HostIp -ne "127.0.0.1" -or
    [int]$exposure[0].HostPort -ne [int]$config.postgresPort) {
    throw "O banco precisa estar publicado exclusivamente em 127.0.0.1."
}

$nonce = [Guid]::NewGuid().ToString("N").Substring(0, 12)
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$cloneName = "andon_hml_restore_$nonce"
$containerDump = "/tmp/andon-hml-$nonce.dump"
$restoredContainerDump = "/tmp/andon-hml-restored-$nonce.dump"
$backupPath = Join-Path $backupDirectory "andon-hml-$timestamp-$nonce.dump"
$manifestPath = "$backupPath.manifest.json"
$startedByScript = $false
$createdClone = $false
$containerDumpCreated = $false
$uploadedDumpCreated = $false
$completed = $false

function Assert-DockerSuccess([string]$Stage) {
    if ($LASTEXITCODE -ne 0) {
        throw "Falha em $Stage. O banco original nao foi restaurado nem substituido."
    }
}
function Get-TableFingerprint([string]$Database, [string]$Table) {
    $allowedTables = @(
        "system_settings", "machines", "workstations", "andon_calls",
        "technician_sessions", "failure_events", "failure_classifications",
        "access_users", "access_sessions", "audit_events"
    )
    if ($Database -notin @($databaseName, $cloneName) -or $Table -notin $allowedTables) {
        throw "Consulta fora da base ou tabela de homologacao."
    }
    # Row hashes are sorted to make the checksum independent of row order.
    $sql = "SELECT COUNT(*)::text || ':' || md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) FROM public." + [char]34 + $Table + [char]34 + " t;"
    $value = (& docker.exe exec $containerName psql -X -q -t -A -v ON_ERROR_STOP=1 -U $databaseUser -d $Database -c $sql | Out-String).Trim()
    Assert-DockerSuccess "verificacao da tabela $Table"
    if ($value -notmatch "^[0-9]+:[a-f0-9]{32}$") {
        throw "Assinatura inesperada para a tabela $Table."
    }
    return $value
}

try {
    $running = (& docker.exe inspect --format "{{.State.Running}}" $containerName | Out-String).Trim()
    Assert-DockerSuccess "consulta de estado do container"
    if ($running -ne "true") {
        & docker.exe start $containerName | Out-Null
        Assert-DockerSuccess "inicio do container isolado"
        $startedByScript = $true
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker.exe exec $containerName pg_isready -U $databaseUser -d $databaseName 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw "PostgreSQL isolado nao respondeu." }

    $tables = @(
        "system_settings", "machines", "workstations", "andon_calls",
        "technician_sessions", "failure_events", "failure_classifications",
        "access_users", "access_sessions", "audit_events"
    )
    $sourceFingerprint = [ordered]@{}
    foreach ($table in $tables) {
        $sourceFingerprint[$table] = Get-TableFingerprint -Database $databaseName -Table $table
    }

    # Never redirect binary pg_dump stdout through Windows PowerShell 5.1.
    & docker.exe exec $containerName pg_dump -U $databaseUser -d $databaseName --format=custom --no-owner --no-privileges --file=$containerDump | Out-Null
    Assert-DockerSuccess "pg_dump isolado"
    $containerDumpCreated = $true
    & docker.exe exec $containerName pg_restore --list $containerDump | Out-Null
    Assert-DockerSuccess "validacao do formato do dump"

    New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
    # Backup contains credentials and call history even on a test DB.
    # Do not create the archive under an inherited shared ACL.
    & icacls.exe $backupDirectory "/inheritance:r" "/grant:r" "$($env:USERNAME):(OI)(CI)(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel proteger o diretorio de backup." }
    if (Test-Path $backupPath) { throw "Backup existente nao pode ser sobrescrito." }
    $containerCopySource = $containerName + ":" + $containerDump
    & docker.exe cp $containerCopySource $backupPath | Out-Null
    Assert-DockerSuccess "copia binaria do dump"
    $backupFile = Get-Item $backupPath
    if ($backupFile.Length -lt 1024) { throw "Backup incompleto ou inesperadamente pequeno." }
    $sha256 = (Get-FileHash -Algorithm SHA256 -Path $backupPath).Hash
    & icacls.exe $backupPath "/inheritance:r" "/grant:r" "$($env:USERNAME):(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel proteger o dump local." }
    $containerChecksum = (& docker.exe exec $containerName sha256sum $containerDump | Out-String).Trim()
    Assert-DockerSuccess "checksum do dump no Docker"
    if ($containerChecksum -notmatch "^[a-fA-F0-9]{64}\s+" -or
        $containerChecksum.Substring(0,64).ToUpperInvariant() -ne $sha256) {
        throw "O dump copiado para Windows divergiu do arquivo original."
    }
    # Restore specifically from the host-side backup, not the source dump.
    $restoreTarget = $containerName + ":" + $restoredContainerDump
    & docker.exe cp $backupPath $restoreTarget | Out-Null
    Assert-DockerSuccess "retorno do backup Windows ao container isolado"
    $uploadedDumpCreated = $true

    # The restore target is a newly generated, short-lived clone.
    # NEVER restore into andon_https_hml or a user-supplied database.
    & docker.exe exec $containerName createdb -U $databaseUser -T template0 $cloneName | Out-Null
    Assert-DockerSuccess "criacao do banco descartavel"
    $createdClone = $true
    & docker.exe exec $containerName pg_restore -U $databaseUser -d $cloneName --no-owner --no-privileges --exit-on-error $restoredContainerDump | Out-Null
    Assert-DockerSuccess "pg_restore apenas no clone"

    $restoredFingerprint = [ordered]@{}
    foreach ($table in $tables) {
        $restoredFingerprint[$table] = Get-TableFingerprint -Database $cloneName -Table $table
        if ($restoredFingerprint[$table] -ne $sourceFingerprint[$table]) {
            throw "Divergencia no restore da tabela $Table."
        }
    }
    $manifest = [ordered]@{
        validatedUtc = [DateTime]::UtcNow.ToString("o")
        source = "localhost/Docker:$containerName/$databaseName"
        restore = "temporary_clone_deleted_after_check"
        format = "pg_dump_custom"
        backupFile = $backupFile.Name
        backupBytes = $backupFile.Length
        sha256 = $sha256
        tableFingerprints = $restoredFingerprint
        result = "validated"
        productionTouched = $false
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
    & icacls.exe $manifestPath "/inheritance:r" "/grant:r" "$($env:USERNAME):(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel proteger o manifesto." }
    $completed = $true
    Write-Host "BACKUP E RESTORE ISOLADOS VALIDADOS" -ForegroundColor Green
    Write-Host "Arquivo: $backupPath"
    Write-Host "SHA256: $sha256"
    Write-Host "Manifesto: $manifestPath"
    Write-Host "Clone descartavel: $cloneName (sera removido)."
} finally {
    if ($createdClone) {
        & docker.exe exec $containerName dropdb -U $databaseUser --if-exists $cloneName | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Nao foi possivel apagar o clone $cloneName." }
    }
    if ($uploadedDumpCreated) {
        & docker.exe exec $containerName rm -f $restoredContainerDump | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Dump reenviado ainda existe em $restoredContainerDump." }
    }
    if ($containerDumpCreated) {
        & docker.exe exec $containerName rm -f $containerDump | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Dump temporario ainda existe em $containerDump." }
    }
    if ($startedByScript) {
        & docker.exe stop $containerName | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Container isolado permaneceu ligado." }
    }
    if (!$completed) {
        Write-Warning "Teste NAO APROVADO. Nenhum comando de restore foi aplicado ao banco original."
    }
}
