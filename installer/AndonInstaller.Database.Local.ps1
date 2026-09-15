$ErrorActionPreference = "Stop"

function Get-AndonPsql {
    $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $primary = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($primary) { return $primary.FullName }

    $fallbacks = @(
        "C:\Program Files\pgAdmin 4\runtime\psql.exe",
        "C:\Program Files (x86)\pgAdmin 4\runtime\psql.exe",
        "C:\Program Files\PostgreSQL\*\pgAdmin 4\runtime\psql.exe"
    )
    foreach ($path in $fallbacks) {
        $found = Get-ChildItem $path -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }

    return $null
}

function Read-AndonTextWithDefault {
    param([string]$Question, [string]$DefaultValue)

    $value = Read-Host "$Question [$DefaultValue]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
    return $value.Trim()
}

function Assert-AndonPostgresIdentifier {
    param([string]$Value, [string]$Label)

    if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
        throw "$Label invalido: $Value. Use letras, numeros e sublinhado, iniciando por letra ou sublinhado."
    }
}

function ConvertTo-AndonSqlIdentifier {
    param([string]$Value)
    return '"' + $Value.Replace('"', '""') + '"'
}

function ConvertTo-AndonSqlLiteral {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-AndonLocalPsql {
    param(
        [string]$PsqlPath,
        [string]$HostName,
        [int]$Port,
        [string]$User,
        [string]$Database,
        [string]$Password,
        [string[]]$Arguments = @()
    )

    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password
    try {
        $output = & $PsqlPath -h $HostName -p "$Port" -U $User -d $Database @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "psql falhou para usuario $User no banco $Database em ${HostName}:$Port."
        }
        return $output
    } finally {
        if ($null -eq $oldPassword) {
            Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $oldPassword
        }
    }
}

function Test-AndonPostgresObjectExists {
    param(
        [ValidateSet("database", "role")]
        [string]$ObjectType,
        [string]$Name,
        [string]$PsqlPath,
        [string]$HostName,
        [int]$Port,
        [string]$AdminPassword
    )

    $safeName = ConvertTo-AndonSqlLiteral $Name
    $query = if ($ObjectType -eq "database") {
        "SELECT 1 FROM pg_database WHERE datname = $safeName;"
    } else {
        "SELECT 1 FROM pg_roles WHERE rolname = $safeName;"
    }

    $result = Invoke-AndonLocalPsql `
        -PsqlPath $PsqlPath `
        -HostName $HostName `
        -Port $Port `
        -User "postgres" `
        -Database "postgres" `
        -Password $AdminPassword `
        -Arguments @("-tA", "-v", "ON_ERROR_STOP=1", "-c", $query)

    return "$result".Trim() -eq "1"
}

function Invoke-AndonLocalAdminSql {
    param(
        [string]$PsqlPath,
        [string]$HostName,
        [int]$Port,
        [string]$AdminPassword,
        [string]$Sql
    )

    $tempSql = Join-Path ([IO.Path]::GetTempPath()) "andon-local-db-$([guid]::NewGuid().ToString('N')).sql"
    try {
        $Sql | Set-Content $tempSql -Encoding UTF8
        Invoke-AndonLocalPsql `
            -PsqlPath $PsqlPath `
            -HostName $HostName `
            -Port $Port `
            -User "postgres" `
            -Database "postgres" `
            -Password $AdminPassword `
            -Arguments @("-v", "ON_ERROR_STOP=1", "-f", $tempSql) |
            Out-Null
    } finally {
        Remove-Item $tempSql -Force -ErrorAction SilentlyContinue
    }
}

function Initialize-AndonLocalDatabase {
    param([object]$ExistingConfig = $null)

    Write-AndonHeader "POSTGRESQL LOCAL WINDOWS - CORPORATIVO"

    $psql = Get-AndonPsql
    if (!$psql) { throw "psql.exe nao encontrado. Instale o cliente do PostgreSQL local." }
    Write-AndonOk "psql.exe: $psql"

    $defaultHost = if ($ExistingConfig -and $ExistingConfig.databaseMode -eq "local") { "$($ExistingConfig.postgresHost)" } else { "127.0.0.1" }
    $defaultPort = if ($ExistingConfig -and $ExistingConfig.databaseMode -eq "local") { [int]$ExistingConfig.postgresPort } else { 5432 }
    $defaultDatabase = if (
        $ExistingConfig -and
        $ExistingConfig.databaseMode -eq "local" -and
        "$($ExistingConfig.databaseName)".ToLowerInvariant() -ne "andon_db"
    ) { "$($ExistingConfig.databaseName)" } else { "andon_web_industrial" }
    $defaultUser = if (
        $ExistingConfig -and
        $ExistingConfig.databaseMode -eq "local" -and
        "$($ExistingConfig.databaseName)".ToLowerInvariant() -ne "andon_db"
    ) { "$($ExistingConfig.databaseUser)" } else { "andon_web" }

    $postgresHost = Read-AndonTextWithDefault "Host do PostgreSQL local" $defaultHost
    $postgresPort = Read-AndonPort "Porta do PostgreSQL local" $defaultPort
    $databaseName = Read-AndonTextWithDefault "Nome do banco exclusivo do ANDON" $defaultDatabase
    $databaseUser = Read-AndonTextWithDefault "Usuario dedicado do ANDON" $defaultUser

    Assert-AndonPostgresIdentifier -Value $databaseName -Label "Nome do banco"
    Assert-AndonPostgresIdentifier -Value $databaseUser -Label "Usuario do banco"

    $targetConfig = [pscustomobject]@{
        databaseMode = "local"
        databaseName = $databaseName
        databaseUser = $databaseUser
    }
    Assert-AndonDatabaseTargetSafe -Config $targetConfig

    Write-AndonWarn "O banco legado andon_db e protegido e ficara fora desta instalacao."

    $secureAdminPassword = Read-Host "Senha administrativa do usuario postgres" -AsSecureString
    $adminPassword = Convert-AndonSecureStringToPlainText $secureAdminPassword
    if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw "Senha administrativa nao informada." }

    $databaseExists = Test-AndonPostgresObjectExists `
        -ObjectType "database" `
        -Name $databaseName `
        -PsqlPath $psql `
        -HostName $postgresHost `
        -Port $postgresPort `
        -AdminPassword $adminPassword

    $roleExists = Test-AndonPostgresObjectExists `
        -ObjectType "role" `
        -Name $databaseUser `
        -PsqlPath $psql `
        -HostName $postgresHost `
        -Port $postgresPort `
        -AdminPassword $adminPassword

    $sameConfiguredTarget = (
        $ExistingConfig -and
        $ExistingConfig.databaseMode -eq "local" -and
        "$($ExistingConfig.postgresHost)" -eq $postgresHost -and
        [int]$ExistingConfig.postgresPort -eq $postgresPort -and
        "$($ExistingConfig.databaseName)" -eq $databaseName -and
        "$($ExistingConfig.databaseUser)" -eq $databaseUser
    )
    $knownManagedDatabase = (
        $databaseExists -and
        $sameConfiguredTarget -and
        [bool]$ExistingConfig.databaseCreatedByInstaller
    )
    $knownManagedRole = (
        $roleExists -and
        $sameConfiguredTarget -and
        [bool]$ExistingConfig.databaseUserCreatedByInstaller
    )

    if ($databaseExists -and !$knownManagedDatabase) {
        Write-AndonWarn "Banco preexistente detectado: $databaseName"
        Write-AndonWarn "O instalador nao alterara owner, privilegios ou conteudo automaticamente."
        if (!(Confirm-AndonTyped -Message "Para selecionar o banco preexistente $databaseName sem altera-lo agora, digite USAR_BANCO_EXISTENTE. As migrations exigirao outra confirmacao explicita." -Expected "USAR_BANCO_EXISTENTE")) {
            throw "Banco preexistente nao foi selecionado e permanece inalterado."
        }
    }

    $secureDedicatedPassword = Read-Host "Senha do usuario dedicado $databaseUser (existente ou novo)" -AsSecureString
    $dedicatedPassword = Convert-AndonSecureStringToPlainText $secureDedicatedPassword
    if ([string]::IsNullOrWhiteSpace($dedicatedPassword)) { throw "Senha do usuario dedicado nao informada." }

    $roleCreatedByInstaller = $knownManagedRole
    $databaseCreatedByInstaller = $knownManagedDatabase
    $roleCreatedInThisRun = $false

    if ($roleExists) {
        Write-AndonOk "Usuario preexistente detectado: $databaseUser"
        Write-AndonWarn "Senha e privilegios do usuario preexistente nao serao alterados."
    } else {
        $quotedUser = ConvertTo-AndonSqlIdentifier $databaseUser
        $quotedPassword = ConvertTo-AndonSqlLiteral $dedicatedPassword
        Invoke-AndonLocalAdminSql `
            -PsqlPath $psql `
            -HostName $postgresHost `
            -Port $postgresPort `
            -AdminPassword $adminPassword `
            -Sql "CREATE ROLE $quotedUser LOGIN PASSWORD $quotedPassword;"
        $roleCreatedByInstaller = $true
        $roleCreatedInThisRun = $true
        Write-AndonOk "Usuario dedicado criado sem privilegios globais extras: $databaseUser"
    }

    if (!$databaseExists) {
        $quotedDatabase = ConvertTo-AndonSqlIdentifier $databaseName
        $quotedUser = ConvertTo-AndonSqlIdentifier $databaseUser
        try {
            Invoke-AndonLocalAdminSql `
                -PsqlPath $psql `
                -HostName $postgresHost `
                -Port $postgresPort `
                -AdminPassword $adminPassword `
                -Sql "CREATE DATABASE $quotedDatabase OWNER $quotedUser;"
        } catch {
            if ($roleCreatedInThisRun) {
                Write-AndonWarn "Falha ao criar o banco. Tentando remover a role nova para evitar estado parcial."
                try {
                    Invoke-AndonLocalAdminSql `
                        -PsqlPath $psql `
                        -HostName $postgresHost `
                        -Port $postgresPort `
                        -AdminPassword $adminPassword `
                        -Sql "DROP ROLE IF EXISTS $quotedUser;"
                } catch {
                    Write-AndonWarn "Nao foi possivel reverter a role $databaseUser; revise-a manualmente."
                }
            }
            throw
        }
        $databaseCreatedByInstaller = $true
        Write-AndonOk "Banco exclusivo criado: $databaseName"
    }

    $config = Get-AndonDefaultConfig
    $config.databaseMode = "local"
    $config.postgresHost = $postgresHost
    $config.postgresPort = [int]$postgresPort
    $config.databaseName = $databaseName
    $config.databaseUser = $databaseUser
    $config.databasePassword = $dedicatedPassword
    $config.databaseCreatedByInstaller = $databaseCreatedByInstaller
    $config.databaseUserCreatedByInstaller = $roleCreatedByInstaller
    $config.apiPort = $Global:AndonApiPort
    $config.frontendPort = $Global:AndonFrontendPort
    $config.projectPath = $Global:AndonProjectPath
    $config.toolsPath = $Global:AndonToolsPath
    Save-AndonConfig $config

    Invoke-AndonLocalPsql `
        -PsqlPath $psql `
        -HostName $postgresHost `
        -Port $postgresPort `
        -User $databaseUser `
        -Database $databaseName `
        -Password $dedicatedPassword `
        -Arguments @("-v", "ON_ERROR_STOP=1", "-c", "SELECT current_database(), current_user;") |
        Out-Null

    Write-AndonOk "PostgreSQL local configurado exclusivamente para o ANDON."
    return $config
}

function Remove-AndonLocalDatabaseClean {
    $config = Import-AndonConfig
    if ($config.databaseMode -ne "local") {
        Write-AndonWarn "databaseMode nao e local. Nada sera removido no PostgreSQL local."
        return
    }

    Assert-AndonDatabaseTargetSafe -Config $config

    $databaseManagedByInstaller = [bool]$config.databaseCreatedByInstaller
    $removeDatabase = $databaseManagedByInstaller
    $removeUser = [bool]$config.databaseUserCreatedByInstaller
    if (!$removeDatabase -and !$removeUser) {
        Write-AndonWarn "Banco e usuario eram preexistentes; ambos ficam fora da desinstalacao."
        return
    }

    $psql = Get-AndonPsql
    if (!$psql) {
        Write-AndonWarn "psql.exe nao encontrado. Banco e usuario foram preservados."
        return
    }

    if ($removeDatabase) {
        $removeDatabase = Confirm-AndonTyped `
            -Message "O banco $($config.databaseName) foi criado por esta instalacao. Para remove-lo, digite APAGAR_BANCO_ANDON." `
            -Expected "APAGAR_BANCO_ANDON"
    }

    if ($removeUser -and $databaseManagedByInstaller -and !$removeDatabase) {
        Write-AndonWarn "Usuario preservado porque o banco associado foi preservado."
        $removeUser = $false
    } elseif ($removeUser) {
        $removeUser = Confirm-AndonTyped `
            -Message "O usuario $($config.databaseUser) foi criado por esta instalacao. Para remove-lo, digite APAGAR_USUARIO_ANDON." `
            -Expected "APAGAR_USUARIO_ANDON"
    }

    if (!$removeDatabase -and !$removeUser) {
        Write-AndonWarn "Banco e usuario PostgreSQL preservados."
        return
    }

    $secureAdminPassword = Read-Host "Senha administrativa do usuario postgres" -AsSecureString
    $adminPassword = Convert-AndonSecureStringToPlainText $secureAdminPassword
    if ([string]::IsNullOrWhiteSpace($adminPassword)) { throw "Senha administrativa nao informada." }

    if ($removeDatabase) {
        $databaseLiteral = ConvertTo-AndonSqlLiteral "$($config.databaseName)"
        $databaseIdentifier = ConvertTo-AndonSqlIdentifier "$($config.databaseName)"
        Invoke-AndonLocalAdminSql `
            -PsqlPath $psql `
            -HostName "$($config.postgresHost)" `
            -Port ([int]$config.postgresPort) `
            -AdminPassword $adminPassword `
            -Sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $databaseLiteral AND pid <> pg_backend_pid();`r`nDROP DATABASE IF EXISTS $databaseIdentifier;"
        Write-AndonOk "Banco removido: $($config.databaseName)"
    } else {
        Write-AndonWarn "Banco preservado: $($config.databaseName)"
    }

    if ($removeUser) {
        $userIdentifier = ConvertTo-AndonSqlIdentifier "$($config.databaseUser)"
        Invoke-AndonLocalAdminSql `
            -PsqlPath $psql `
            -HostName "$($config.postgresHost)" `
            -Port ([int]$config.postgresPort) `
            -AdminPassword $adminPassword `
            -Sql "DROP ROLE IF EXISTS $userIdentifier;"
        Write-AndonOk "Usuario removido: $($config.databaseUser)"
    } else {
        Write-AndonWarn "Usuario preservado: $($config.databaseUser)"
    }

    Write-AndonWarn "O PostgreSQL 17 nao foi desinstalado nem reconfigurado."
}
