# REFINE13 - Fail-closed pre-migration backup and isolated PostgreSQL restore.
function Assert-AndonUpdateBackupRestorable {
    param([Parameter(Mandatory=$true)][object]$Config)
    $dbHost = "$($Config.postgresHost)".Trim().ToLowerInvariant()
    $database = "$($Config.databaseName)".Trim()
    $user = "$($Config.databaseUser)".Trim()
    $port = [int]$Config.postgresPort
    $mode = "$($Config.databaseMode)".Trim().ToLowerInvariant()
    if ($dbHost -notin @("127.0.0.1", "localhost") -or $mode -notin @("docker", "local")) {
        throw "Backup seguro exige PostgreSQL local suportado."
    }
    if ($database -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' -or
        $user -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' -or
        $database -in @("postgres", "template0", "template1") -or
        $port -lt 1 -or $port -gt 65535) {
        throw "Configuracao do PostgreSQL invalida para backup."
    }
    $nonce = [guid]::NewGuid().ToString("N")
    $clone = "andon_verify_$($nonce.Substring(0,12))"
    $privateDir = Join-Path $Global:AndonBackupsPath "update-$nonce"
    New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
    & icacls.exe $privateDir /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" 1>$null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel proteger ACL do backup." }
    $dump = Join-Path $privateDir "database.dump"
    $inside = "/tmp/andon-update-$nonce.dump"
    $cloneCreated = $false
    $restored = $false
    $oldPassword = $env:PGPASSWORD
    try {
        if ($mode -eq "docker") {
            $docker = Get-AndonCommandPath "docker.exe" "Docker nao encontrado."
            $container = "$($Config.dockerContainer)"
            if ($container -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') { throw "Container invalido." }
            $running = & $docker inspect --format "{{.State.Running}}" $container 2>$null
            if ($LASTEXITCODE -ne 0 -or "$running".Trim() -ne "true") { throw "Container PostgreSQL inativo." }
            if ([int](Get-AndonMappedDockerPort $container) -ne $port) { throw "Porta PostgreSQL diverge." }
            & $docker exec $container pg_dump -U $user -d $database --format=custom --no-owner --no-privileges --file=$inside
            if ($LASTEXITCODE -ne 0) { throw "pg_dump Docker falhou." }
            $source = $container + ":" + $inside
            & $docker cp $source $dump
            if ($LASTEXITCODE -ne 0) { throw "docker cp do backup falhou." }
            & $docker exec $container pg_restore --list $inside 1>$null
            if ($LASTEXITCODE -ne 0) { throw "Arquivo de backup invalido." }
            & $docker exec $container createdb -U $user $clone
            if ($LASTEXITCODE -ne 0) { throw "Falha ao criar clone para teste." }
            $cloneCreated = $true
            & $docker exec $container pg_restore -U $user --dbname=$clone --no-owner --no-privileges --exit-on-error $inside
            if ($LASTEXITCODE -ne 0) { throw "Restauracao do banco clonado falhou." }
            $restored = $true
        } else {
            $bins = @{}
            foreach ($tool in @("pg_dump.exe", "pg_restore.exe", "createdb.exe", "dropdb.exe")) {
                $found = Get-Command $tool -ErrorAction SilentlyContinue
                if (!$found) { throw "Ferramenta PostgreSQL ausente: $tool" }
                $bins[$tool] = $found.Source
            }
            $env:PGPASSWORD = "$($Config.databasePassword)"
            $argsPg = @("-h", "127.0.0.1", "-p", "$port", "-U", $user, "-w")
            & $bins["pg_dump.exe"] @argsPg -d $database --format=custom --no-owner --no-privileges --file=$dump
            if ($LASTEXITCODE -ne 0) { throw "pg_dump local falhou." }
            & $bins["pg_restore.exe"] --list $dump 1>$null
            if ($LASTEXITCODE -ne 0) { throw "Arquivo de backup invalido." }
            & $bins["createdb.exe"] @argsPg $clone
            if ($LASTEXITCODE -ne 0) { throw "Falha ao criar clone para teste." }
            $cloneCreated = $true
            & $bins["pg_restore.exe"] @argsPg --dbname=$clone --no-owner --no-privileges --exit-on-error $dump
            if ($LASTEXITCODE -ne 0) { throw "Restauracao do banco clonado falhou." }
            $restored = $true
        }
        if (!(Test-Path $dump -PathType Leaf) -or (Get-Item $dump).Length -lt 1024) {
            throw "Backup ausente ou incompleto."
        }
        $hash = (Get-FileHash -Algorithm SHA256 -Path $dump).Hash
        $proof = [ordered]@{
            schema = "andon-update-backup-v1"
            timestampUtc = (Get-Date).ToUniversalTime().ToString("o")
            database = $database
            mode = $mode
            sha256 = $hash
            isolatedRestore = $restored
        }
        $proof | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $privateDir "restore-proof.json") -Encoding UTF8
        Write-AndonOk "Backup validado com restauracao isolada: $privateDir"
    } finally {
        if ($cloneCreated) {
            if ($mode -eq "docker") { & $docker exec $container dropdb -U $user --if-exists $clone }
            else { & $bins["dropdb.exe"] @argsPg --if-exists $clone }
            if ($LASTEXITCODE -ne 0) { throw "Banco temporario nao removido: $clone" }
        }
        if ($mode -eq "docker" -and $docker -and $container) {
            & $docker exec $container rm -f $inside 1>$null 2>$null
        }
        if ($null -eq $oldPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        else { $env:PGPASSWORD = $oldPassword }
    }
    if (!$restored) { throw "Restauracao isolada nao comprovada." }
    return $dump
}
