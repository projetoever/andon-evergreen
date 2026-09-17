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

function Invoke-AndonLocalPsqlQuery {
    param(
        [string]$PsqlPath,
        [int]$Port,
        [string]$User,
        [string]$Database,
        [string]$Password,
        [string]$Query
    )

    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password
    try {
        $output = @(
            & $PsqlPath `
                -X `
                -h $Global:AndonPostgresHost `
                -p "$Port" `
                -U $User `
                -d $Database `
                -v "ON_ERROR_STOP=1" `
                -A `
                -t `
                -F "|" `
                -c $Query
        )
        if ($LASTEXITCODE -ne 0) {
            throw "psql falhou para usuario $User no banco $Database durante o precheck."
        }
        return ($output -join "`n").Trim()
    } finally {
        if ($null -eq $oldPassword) {
            Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $oldPassword
        }
    }
}

function Test-AndonLocalDatabaseCredentials {
    param(
        [string]$PsqlPath,
        [int]$Port,
        [string]$User,
        [string]$Database,
        [string]$Password
    )

    try {
        Invoke-AndonLocalPsqlQuery `
            -PsqlPath $PsqlPath `
            -Port $Port `
            -User $User `
            -Database $Database `
            -Password $Password `
            -Query "SELECT current_user;" |
            Out-Null
        return $true
    } catch {
        return $false
    }
}

function Initialize-AndonLocalDatabase {
    Write-AndonHeader "POSTGRESQL LOCAL WINDOWS - AVANCADO"
    $psql = Get-AndonPsql
    if (!$psql) { throw "psql.exe nao encontrado. Instale PostgreSQL local ou use o modo Docker recomendado." }
    Write-AndonOk "psql.exe: $psql"
    $postgresPort = Read-AndonPort "Porta do PostgreSQL local" 5432
    $adminUserInput = Read-Host "Usuario administrativo PostgreSQL [postgres]"
    $adminUser = if ([string]::IsNullOrWhiteSpace($adminUserInput)) { "postgres" } else { $adminUserInput.Trim() }
    $securePassword = Read-Host "Senha do usuario administrativo $adminUser" -AsSecureString
    $adminPassword = Convert-AndonSecureStringToPlainText $securePassword

    Write-AndonHeader "PRECHECK POSTGRESQL LOCAL"
    $adminRow = Invoke-AndonLocalPsqlQuery `
        -PsqlPath $psql `
        -Port $postgresPort `
        -User $adminUser `
        -Database "postgres" `
        -Password $adminPassword `
        -Query "SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user;"

    $adminFields = @($adminRow -split '\|')
    if ($adminFields.Count -ne 5 -or $adminFields[0] -ne $adminUser) {
        throw "Precheck PostgreSQL nao confirmou o role administrativo autenticado. Nenhuma alteracao foi executada."
    }

    $adminCanLogin = $adminFields[1] -eq "t"
    $adminIsSuperuser = $adminFields[2] -eq "t"
    $adminCanCreateDatabase = $adminFields[3] -eq "t"
    $adminCanCreateRole = $adminFields[4] -eq "t"

    if (!$adminCanLogin) {
        throw "Role administrativo $adminUser possui NOLOGIN. Informe um role administrativo com LOGIN. Nenhuma alteracao foi executada."
    }

    $andonRoleRow = Invoke-AndonLocalPsqlQuery `
        -PsqlPath $psql `
        -Port $postgresPort `
        -User $adminUser `
        -Database "postgres" `
        -Password $adminPassword `
        -Query "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = '$Global:AndonDatabaseUser';"
    $andonDatabaseRow = Invoke-AndonLocalPsqlQuery `
        -PsqlPath $psql `
        -Port $postgresPort `
        -User $adminUser `
        -Database "postgres" `
        -Password $adminPassword `
        -Query "SELECT datname, pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$Global:AndonDatabaseName';"

    $andonRoleExists = ![string]::IsNullOrWhiteSpace($andonRoleRow)
    $andonDatabaseExists = ![string]::IsNullOrWhiteSpace($andonDatabaseRow)

    if ($andonRoleExists) {
        $andonRoleFields = @($andonRoleRow -split '\|')
        if ($andonRoleFields.Count -ne 2 -or $andonRoleFields[0] -ne $Global:AndonDatabaseUser) {
            throw "Role preexistente $Global:AndonDatabaseUser nao corresponde ao formato esperado. Nenhuma alteracao foi executada."
        }
        if ($andonRoleFields[1] -ne "t") {
            throw "Role preexistente $Global:AndonDatabaseUser possui NOLOGIN e nao sera alterado automaticamente."
        }

        $credentialDatabase = if ($andonDatabaseExists) { $Global:AndonDatabaseName } else { "postgres" }
        if (!(Test-AndonLocalDatabaseCredentials `
            -PsqlPath $psql `
            -Port $postgresPort `
            -User $Global:AndonDatabaseUser `
            -Database $credentialDatabase `
            -Password $Global:AndonDatabasePassword)) {
            throw (
                "Role preexistente $Global:AndonDatabaseUser nao autenticou com a credencial esperada pelo ANDON. " +
                "A senha e os privilegios nao serao alterados automaticamente."
            )
        }
    }

    if ($andonDatabaseExists) {
        $andonDatabaseFields = @($andonDatabaseRow -split '\|')
        if (
            $andonDatabaseFields.Count -ne 2 -or
            $andonDatabaseFields[0] -ne $Global:AndonDatabaseName -or
            $andonDatabaseFields[1] -ne $Global:AndonDatabaseUser
        ) {
            throw (
                "Banco preexistente $Global:AndonDatabaseName nao pertence ao role esperado " +
                "$Global:AndonDatabaseUser e nao sera alterado automaticamente."
            )
        }
    }

    if (!$andonRoleExists -and !$adminIsSuperuser -and !$adminCanCreateRole) {
        throw "Role administrativo $adminUser nao possui CREATEROLE. Nenhuma alteracao foi executada."
    }
    if (!$andonDatabaseExists -and !$adminIsSuperuser -and !$adminCanCreateDatabase) {
        throw "Role administrativo $adminUser nao possui CREATEDB. Nenhuma alteracao foi executada."
    }
    if ($andonDatabaseExists -and !$andonRoleExists) {
        throw "Banco $Global:AndonDatabaseName existe sem o role esperado $Global:AndonDatabaseUser. Nenhuma alteracao foi executada."
    }

    Write-AndonOk "Precheck PostgreSQL aprovado antes de qualquer SQL mutavel."

    $tempSql = Join-Path $env:TEMP "andon-local-db-$([guid]::NewGuid().ToString('N')).sql"
    $mutableStatements = @()
    if (!$andonRoleExists) {
        $mutableStatements += "CREATE ROLE $Global:AndonDatabaseUser LOGIN PASSWORD '$Global:AndonDatabasePassword';"
    }
    if (!$andonDatabaseExists) {
        $mutableStatements += "CREATE DATABASE $Global:AndonDatabaseName OWNER $Global:AndonDatabaseUser;"
    }

    if ($mutableStatements.Count -gt 0) {
        try {
            ($mutableStatements -join "`r`n") | Set-Content $tempSql -Encoding UTF8
            Invoke-AndonLocalPsql `
                -PsqlPath $psql `
                -Port $postgresPort `
                -User $adminUser `
                -Database "postgres" `
                -Password $adminPassword `
                -Arguments @("-v", "ON_ERROR_STOP=1", "-f", $tempSql)
        } finally {
            Remove-Item $tempSql -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-AndonOk "Role e banco ANDON existentes foram preservados sem SQL mutavel."
    }

    Invoke-AndonLocalPsql `
        -PsqlPath $psql `
        -Port $postgresPort `
        -User $Global:AndonDatabaseUser `
        -Database $Global:AndonDatabaseName `
        -Password $Global:AndonDatabasePassword `
        -Arguments @("-c", "SELECT current_database(), current_user;")
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
