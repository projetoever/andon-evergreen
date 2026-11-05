# REFINE 8 / SEC-17. Configurador de seguranca central SOMENTE para homologacao isolada.
# Nao inicia processos, nao aplica migrations e nao modifica o banco operacional.
[CmdletBinding()]
param(
    [ValidateSet('Check', 'Enable', 'Restore')]
    [string]$Action = 'Check',
    [string]$ConfigPath = 'C:\web-andon-industrial\andon-config.json',
    [string]$RestoreFrom = '',
    [switch]$ConfirmIsolated
)
$ErrorActionPreference = 'Stop'
$expectedConfigPath = 'C:\web-andon-industrial\andon-config.json'
$backupRoot = 'C:\web-andon-industrial\backups\refine8-central'

function Assert-Refine8LabConfig {
    param([object]$Config)
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    if ([int]$os.ProductType -ne 1) { throw 'BLOQUEADO: somente Windows cliente isolado, nunca Windows Server.' }
    if ([IO.Path]::GetFullPath($ConfigPath).TrimEnd('\') -ine $expectedConfigPath) {
        throw 'BLOQUEADO: este configurador so atua na configuracao do runtime oficial, no host de homologacao.'
    }
    if ("$($Config.databaseMode)" -ne 'docker' -or "$($Config.databaseName)" -ne 'andon_https_hml' -or
        "$($Config.postgresHost)" -ne '127.0.0.1' -or [int]$Config.postgresPort -ne 55432 -or
        "$($Config.dockerContainer)" -notmatch 'hml' -or "$($Config.dockerVolume)" -notmatch 'hml' -or
        "$($Config.dockerContainer)" -eq 'andon-postgres' -or "$($Config.dockerVolume)" -eq 'andon-postgres-data') {
        throw 'BLOQUEADO: banco, container e volume de homologacao devem ser independentes do andon_db.'
    }
    if ("$($Config.transportMode)" -ne 'https' -or
        "$($Config.httpsHost)" -notin @('127.0.0.1', 'localhost')) {
        throw 'BLOQUEADO: modo central exige HTTPS local no laboratorio antes de testar rede.'
    }
    if (!(Test-Path -LiteralPath "$($Config.tlsCertificatePath)" -PathType Leaf) -or
        !(Test-Path -LiteralPath "$($Config.tlsPrivateKeyPath)" -PathType Leaf)) {
        throw 'BLOQUEADO: certificado ou chave HTTPS local ausentes.'
    }
    if ("$($Config.projectPath)" -ine 'C:\web-andon-industrial\andon') {
        throw 'BLOQUEADO: use o projeto do runtime oficial dentro da VM de homologacao.'
    }
    $bindingsJson = & docker.exe inspect --format '{{json .HostConfig.PortBindings}}' "$($Config.dockerContainer)" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'BLOQUEADO: Docker do laboratorio indisponivel.' }
    $bindings = $bindingsJson | ConvertFrom-Json
    $portBinding = $bindings.PSObject.Properties['5432/tcp'].Value
    if (@($portBinding).Count -ne 1 -or "$($portBinding[0].HostIp)" -ne '127.0.0.1' -or
        "$($portBinding[0].HostPort)" -ne '55432') {
        throw 'BLOQUEADO: container PostgreSQL nao esta limitado a 127.0.0.1:55432.'
    }
    $mountsJson = & docker.exe inspect --format '{{json .Mounts}}' "$($Config.dockerContainer)" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'BLOQUEADO: nao foi possivel validar o volume Docker.' }
    $mounts = @($mountsJson | ConvertFrom-Json)
    if (@($mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq "$($Config.dockerVolume)" }).Count -ne 1) {
        throw 'BLOQUEADO: volume isolado nao corresponde a configuracao declarada.'
    }
}

function Assert-Refine8RuntimeStopped {
    $active = @(Get-NetTCPConnection -State Listen -LocalPort @(3001, 8080) -ErrorAction SilentlyContinue)
    if ($active.Count -gt 0) {
        throw 'BLOQUEADO: use a opcao 5 do menu oficial e confira a parada antes de alterar a configuracao.'
    }
}

function Set-Refine8ConfigAtomically {
    param([object]$NewConfig)
    $temporary = Join-Path (Split-Path -Parent $ConfigPath) ('.refine8-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($temporary, ($NewConfig | ConvertTo-Json -Depth 20), $utf8)
        [void](Get-Content -LiteralPath $temporary -Raw | ConvertFrom-Json)
        [IO.File]::Replace($temporary, $ConfigPath, $null)
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

if (!(Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { throw 'Configuracao oficial nao encontrada.' }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
Assert-Refine8LabConfig $config
$gitHead = (& git.exe -C "$($config.projectPath)" rev-parse HEAD 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or "$gitHead" -notmatch '^[0-9a-f]{40}$') { throw 'Git HEAD nao verificavel.' }
if ("$($config.installedCommit)" -ne "$gitHead") {
    throw 'BLOQUEADO: installedCommit difere do Git HEAD; primeiro homologue o update/build oficial.'
}
$apiBuild = Join-Path "$($config.projectPath)" 'server\dist\server.js'
$frontBuild = Join-Path "$($config.projectPath)" 'dist\server\server.js'
if (!(Test-Path $apiBuild -PathType Leaf) -or !(Test-Path $frontBuild -PathType Leaf)) {
    throw 'BLOQUEADO: builds da API/frontend nao encontrados.'
}
Write-Host ('Laboratorio validado. SHA declarado: ' + $gitHead)
Write-Host ('Banco isolado: ' + $config.databaseName + ' (127.0.0.1:55432)')
Write-Host ('Seguranca central: ' + $config.centralAccessEnabled)
if ($Action -eq 'Check') { Write-Host 'CHECK: somente leitura, nenhuma mudanca.'; exit 0 }
if (!$ConfirmIsolated) { throw 'BLOQUEADO: informe -ConfirmIsolated apenas apos conferir host/backup/rollback.' }
Assert-Refine8RuntimeStopped

if ($Action -eq 'Restore') {
    if ([string]::IsNullOrWhiteSpace($RestoreFrom)) { throw 'Informe -RestoreFrom com o backup valido do laboratorio.' }
    $fullBackup = [IO.Path]::GetFullPath($RestoreFrom)
    $prefix = [IO.Path]::GetFullPath($backupRoot).TrimEnd('\') + '\'
    if (!$fullBackup.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($fullBackup) -ne 'andon-config.before.json') {
        throw 'BLOQUEADO: backup fora da area protegida do REFINE 8.'
    }
    $saved = Get-Content -LiteralPath $fullBackup -Raw | ConvertFrom-Json
    if ("$($saved.databaseName)" -ne "$($config.databaseName)" -or
        "$($saved.dockerContainer)" -ne "$($config.dockerContainer)" -or
        "$($saved.centralAccessEnabled)" -ne 'False') {
        throw 'BLOQUEADO: backup nao corresponde ao laboratorio central OFF.'
    }
    Set-Refine8ConfigAtomically $saved
    Write-Host 'Configuracao central OFF restaurada. Reinicie somente pelo menu oficial.'
    Write-Host 'O banco de homologacao nao foi restaurado automaticamente; confira o dump antes de recuperar dados.'
    exit 0
}

if ($config.centralAccessEnabled -eq $true) { throw 'Seguranca central ja esta ON; nenhuma mudanca.' }
$folder = Join-Path $backupRoot ((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
& icacls.exe $folder /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Falha na ACL do backup. Configuracao nao alterada.' }
$configurationBackup = Join-Path $folder 'andon-config.before.json'
Copy-Item -LiteralPath $ConfigPath -Destination $configurationBackup -ErrorAction Stop
if ((Get-FileHash $configurationBackup -Algorithm SHA256).Hash -ne
    (Get-FileHash $ConfigPath -Algorithm SHA256).Hash) { throw 'Backup de configuracao nao validou SHA256.' }
$dumpName = '/tmp/refine8-sec17-' + [guid]::NewGuid().ToString('N') + '.dump'
try {
    & docker.exe exec "$($config.dockerContainer)" pg_dump -U "$($config.databaseUser)" -d "$($config.databaseName)" -Fc -f $dumpName
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou; central nao sera ativado.' }
    & docker.exe exec "$($config.dockerContainer)" pg_restore -l $dumpName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore -l falhou; dump invalido.' }
    & docker.exe cp ("$($config.dockerContainer):" + $dumpName) (Join-Path $folder 'andon_https_hml.dump') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker cp do dump falhou.' }
    if ((Get-Item (Join-Path $folder 'andon_https_hml.dump')).Length -lt 512) {
        throw 'Dump incompleto; ativacao negada.'
    }
} finally {
    & docker.exe exec "$($config.dockerContainer)" rm -f $dumpName 2>$null | Out-Null
}
$config | Add-Member -MemberType NoteProperty -Name 'centralAccessEnabled' -Value $true -Force
try {
    Set-Refine8ConfigAtomically $config
    $verified = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($verified.centralAccessEnabled -ne $true) { throw 'Central ON nao persistiu.' }
} catch {
    Copy-Item -LiteralPath $configurationBackup -Destination $ConfigPath -Force
    throw 'Ativacao falhou; configuracao anterior restaurada. Verifique o backup protegido.'
}
Write-Host 'CENTRAL ON somente no banco e host isolados. Nenhum processo foi iniciado.'
Write-Host ('Backup protegido: ' + $folder)
Write-Host 'Agora use SOMENTE a opcao 4 do menu oficial nessa VM e execute os testes de homologacao.'
