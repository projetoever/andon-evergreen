$ErrorActionPreference = "Stop"

function Get-AndonPsql {
    $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $primary = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($primary) { return $primary.FullName }
    $fallbacks = @("C:\Program Files\pgAdmin 4\runtime\psql.exe", "C:\Program Files (x86)\pgAdmin 4\runtime\psql.exe", "C:\Program Files\PostgreSQL\*\pgAdmin 4\runtime\psql.exe")
    foreach ($path in $fallbacks) {
        $found = Get-ChildItem $path -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Invoke-AndonLocalPsql {
    param([string]$PsqlPath, [int]$Port, [string]$User, [string]$Database, [string]$Password, [string[]]$Arguments = @())
    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password
    try {
        & $PsqlPath -h $Global:AndonPostgresHost -p "$Port" -U $User -d $Database @Arguments
        if ($LASTEXITCODE -ne 0) { throw "psql falhou para usuario $User no banco $Database." }
    } finally {
        if ($null -eq $oldPassword) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $oldPassword }
    }
}

function Initialize-AndonLocalDatabase {
    Write-AndonHeader "POSTGRESQL LOCAL WINDOWS - AVANCADO"
    $psql = Get-AndonPsql
    if (!$psql) { throw "psql.exe nao encontrado. Instale PostgreSQL local ou use o modo Docker recomendado." }
    Write-AndonOk "psql.exe: $psql"
    $postgresPort = Read-AndonPort "Porta do PostgreSQL local" 5432
    $securePassword = Read-Host "Senha do usuario postgres local" -AsSecureString
    $postgresPassword = Convert-AndonSecureStringToPlainText $securePassword
    $tempSql = Join-Path $env:TEMP "andon-local-db-$([guid]::NewGuid().ToString('N')).sql"
    $sql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$Global:AndonDatabaseUser') THEN
    CREATE USER $Global:AndonDatabaseUser WITH PASSWORD '$Global:AndonDatabasePassword' CREATEDB;
  ELSE
    ALTER USER $Global:AndonDatabaseUser WITH PASSWORD '$Global:AndonDatabasePassword' CREATEDB;
  END IF;
END
`$`$;

SELECT 'CREATE DATABASE $Global:AndonDatabaseName OWNER $Global:AndonDatabaseUser'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$Global:AndonDatabaseName')\gexec

GRANT ALL PRIVILEGES ON DATABASE $Global:AndonDatabaseName TO $Global:AndonDatabaseUser;
"@
    try {
        $sql | Set-Content $tempSql -Encoding UTF8
        Invoke-AndonLocalPsql -PsqlPath $psql -Port $postgresPort -User "postgres" -Database "postgres" -Password $postgresPassword -Arguments @("-v", "ON_ERROR_STOP=1", "-f", $tempSql)
        Invoke-AndonLocalPsql -PsqlPath $psql -Port $postgresPort -User $Global:AndonDatabaseUser -Database $Global:AndonDatabaseName -Password $Global:AndonDatabasePassword -Arguments @("-c", "SELECT current_database(), current_user;")
    } finally { Remove-Item $tempSql -Force -ErrorAction SilentlyContinue }
    $config = Get-AndonDefaultConfig
    $config.databaseMode = "local"
    $config.postgresHost = "127.0.0.1"
    $config.postgresPort = [int]$postgresPort
    $config.databaseName = $Global:AndonDatabaseName
    $config.databaseUser = $Global:AndonDatabaseUser
    $config.databasePassword = $Global:AndonDatabasePassword
    $config.apiPort = $Global:AndonApiPort
    $config.frontendPort = $Global:AndonFrontendPort
    $config.projectPath = $Global:AndonProjectPath
    $config.toolsPath = $Global:AndonToolsPath
    Save-AndonConfig $config
    Write-AndonOk "Banco local validado."
    return $config
}

function Remove-AndonLocalDatabaseClean {
    $config = Import-AndonConfig
    if ($config.databaseMode -ne "local") { Write-AndonWarn "databaseMode nao e local. Nada sera removido no PostgreSQL local."; return }
    $psql = Get-AndonPsql
    if (!$psql) { Write-AndonWarn "psql.exe nao encontrado. Nao sera possivel remover banco local automaticamente."; return }
    if (!(Confirm-AndonTyped -Message "Para remover andon_db e usuario andon do PostgreSQL local, digite APAGAR_BANCO." -Expected "APAGAR_BANCO")) { Write-AndonWarn "Banco local preservado."; return }
    $securePassword = Read-Host "Senha do usuario postgres local" -AsSecureString
    $postgresPassword = Convert-AndonSecureStringToPlainText $securePassword
    $tempSql = Join-Path $env:TEMP "andon-local-drop-$([guid]::NewGuid().ToString('N')).sql"
    $sql = @"
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Global:AndonDatabaseName';
DROP DATABASE IF EXISTS $Global:AndonDatabaseName;
DROP USER IF EXISTS $Global:AndonDatabaseUser;
"@
    try {
        $sql | Set-Content $tempSql -Encoding UTF8
        Invoke-AndonLocalPsql -PsqlPath $psql -Port ([int]$config.postgresPort) -User "postgres" -Database "postgres" -Password $postgresPassword -Arguments @("-v", "ON_ERROR_STOP=1", "-f", $tempSql)
        Write-AndonOk "Banco local andon_db/usuario andon removidos."
    } finally { Remove-Item $tempSql -Force -ErrorAction SilentlyContinue }
    Write-AndonWarn "O PostgreSQL local NAO foi desinstalado do Windows."
}
