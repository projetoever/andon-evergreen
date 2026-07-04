$Global:AndonBasePath = "C:\web-andon-industrial"
$Global:AndonProjectPath = "$Global:AndonBasePath\andon"
$Global:AndonToolsPath = "$Global:AndonBasePath\andon-tools"
$Global:AndonInstallerPath = "$Global:AndonBasePath\installer"
$Global:AndonLogsPath = "$Global:AndonProjectPath\logs"
$Global:AndonBackupsPath = "$Global:AndonProjectPath\backups"
$Global:AndonChromeProfilePath = "$Global:AndonProjectPath\chrome-profile"

$Global:AndonRepoUrl = "https://github.com/projetoever/andon-evergreen.git"
$Global:AndonBranch = "main"

$Global:AndonApiPort = 3001
$Global:AndonFrontendPort = 8080
$Global:AndonPostgresPort = 5432
$Global:AndonPostgresHost = "127.0.0.1"
$Global:AndonConfigPath = "$Global:AndonBasePath\andon-config.json"

$Global:AndonDatabaseName = "andon_db"
$Global:AndonDatabaseUser = "andon"
$Global:AndonDatabasePassword = "andon_dev_password"
$Global:AndonPostgresBinPath = "C:\Program Files\PostgreSQL\18\bin"

$Global:AndonTaskBoot = "ANDON - Boot Servicos"
$Global:AndonTaskWatchdog = "ANDON - Watchdog Servicos"
$Global:AndonTaskKiosk = "ANDON - Chrome Kiosk"

function Write-AndonHeader {
    param([string]$Title)

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-AndonOk {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-AndonWarn {
    param([string]$Message)
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Write-AndonFail {
    param([string]$Message)
    Write-Host "[FALHA] $Message" -ForegroundColor Red
}

function Initialize-AndonFolders {
    New-Item -ItemType Directory -Force $Global:AndonBasePath | Out-Null
    New-Item -ItemType Directory -Force $Global:AndonInstallerPath | Out-Null

    if (Test-Path $Global:AndonProjectPath) {
        New-Item -ItemType Directory -Force $Global:AndonLogsPath | Out-Null
        New-Item -ItemType Directory -Force $Global:AndonBackupsPath | Out-Null
        New-Item -ItemType Directory -Force $Global:AndonChromeProfilePath | Out-Null
    }
}

function Write-AndonLog {
    param(
        [string]$Message,
        [string]$LogName = "installer.log"
    )

    Initialize-AndonFolders

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"

    Write-Host $line

    if (Test-Path $Global:AndonProjectPath) {
        Add-Content -Path "$Global:AndonLogsPath\$LogName" -Value $line
    } else {
        Add-Content -Path "$Global:AndonInstallerPath\$LogName" -Value $line
    }
}

function Test-AndonAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-AndonAdmin {
    if (!(Test-AndonAdmin)) {
        Write-AndonFail "Execute este script como Administrador."
        exit 1
    }

    Write-AndonOk "PowerShell executando como Administrador."
}

function Get-AndonNpmCmd {
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue

    if ($npmCmd) {
        return $npmCmd.Source
    }

    $defaultPath = "C:\Program Files\nodejs\npm.cmd"

    if (Test-Path $defaultPath) {
        return $defaultPath
    }

    return $null
}

function Get-AndonPsql {
    $primaryCandidates = Get-ChildItem `
        -Path "C:\Program Files\PostgreSQL\*\bin\psql.exe" `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    if ($primaryCandidates -and $primaryCandidates.Count -gt 0) {
        return $primaryCandidates[0].FullName
    }

    $fallbackCandidates = Get-ChildItem `
        -Path "C:\Program Files\PostgreSQL\*\pgAdmin 4\runtime\psql.exe" `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    if ($fallbackCandidates -and $fallbackCandidates.Count -gt 0) {
        return $fallbackCandidates[0].FullName
    }

    return $null
}

function Get-AndonPgDump {
    $primaryCandidates = Get-ChildItem `
        -Path "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    if ($primaryCandidates -and $primaryCandidates.Count -gt 0) {
        return $primaryCandidates[0].FullName
    }

    $fallbackCandidates = Get-ChildItem `
        -Path "C:\Program Files\PostgreSQL\*\pgAdmin 4\runtime\pg_dump.exe" `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    if ($fallbackCandidates -and $fallbackCandidates.Count -gt 0) {
        return $fallbackCandidates[0].FullName
    }

    return $null
}

function Get-AndonChromePath {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $chromeCmd = Get-Command chrome.exe -ErrorAction SilentlyContinue

    if ($chromeCmd) {
        return $chromeCmd.Source
    }

    return $null
}

function Test-AndonPrerequisites {
    Write-AndonHeader "ANDON - VALIDACAO DE PRE-REQUISITOS"

    $hasError = $false

    if (Test-AndonAdmin) {
        Write-AndonOk "PowerShell como Administrador."
    } else {
        Write-AndonFail "PowerShell nao esta como Administrador."
        $hasError = $true
    }

    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        Write-AndonOk "Git encontrado: $($git.Source)"
    } else {
        Write-AndonFail "Git nao encontrado. Instale o Git antes de continuar."
        $hasError = $true
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-AndonOk "Node.js encontrado: $($node.Source)"
    } else {
        Write-AndonFail "Node.js nao encontrado. Instale Node.js LTS antes de continuar."
        $hasError = $true
    }

    $npmCmd = Get-AndonNpmCmd
    if ($npmCmd) {
        Write-AndonOk "npm.cmd encontrado: $npmCmd"
    } else {
        Write-AndonFail "npm.cmd nao encontrado. Verifique a instalacao do Node.js."
        $hasError = $true
    }

    $psql = Get-AndonPsql
    if ($psql) {
        Write-AndonOk "psql.exe encontrado: $psql"
    } else {
        Write-AndonFail "psql.exe nao encontrado em $Global:AndonPostgresBinPath."
        $hasError = $true
    }

    $pgDump = Get-AndonPgDump
    if ($pgDump) {
        Write-AndonOk "pg_dump.exe encontrado: $pgDump"
    } else {
        Write-AndonWarn "pg_dump.exe nao encontrado. Backup automatico pode falhar."
    }

    $chrome = Get-AndonChromePath
    if ($chrome) {
        Write-AndonOk "Chrome encontrado: $chrome"
    } else {
        Write-AndonWarn "Chrome nao encontrado. Kiosk local pode nao funcionar."
    }

    foreach ($port in @($Global:AndonApiPort, $Global:AndonFrontendPort, $Global:AndonPostgresPort)) {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

        if ($connections) {
            Write-AndonWarn "Porta $port esta em uso."
        } else {
            Write-AndonOk "Porta $port livre."
        }
    }

    if ($hasError) {
        Write-AndonFail "Pre-requisitos obrigatorios ausentes."
        return $false
    }

    Write-AndonOk "Pre-requisitos principais validados."
    return $true
}

function Invoke-AndonCommand {
    param(
        [string]$Command,
        [string]$WorkingDirectory = "",
        [string]$LogName = "installer.log"
    )

    Write-AndonLog "Executando comando: $Command" $LogName

    $pushed = $false
    $oldErrorActionPreference = $ErrorActionPreference

    if ($WorkingDirectory -and (Test-Path $WorkingDirectory)) {
        Push-Location $WorkingDirectory
        $pushed = $true
    }

    try {
        $ErrorActionPreference = "Continue"

        $output = cmd.exe /d /c $Command 2>&1
        $exitCode = $LASTEXITCODE

        foreach ($line in $output) {
            Write-Host $line
            Write-AndonLog "$line" $LogName
        }

        if ($exitCode -ne 0) {
            Write-AndonFail "Comando falhou com codigo ${exitCode}: $Command"
            return $false
        }

        Write-AndonOk "Comando concluido: $Command"
        return $true
    } catch {
        Write-AndonFail "Erro ao executar comando: $($_.Exception.Message)"
        return $false
    } finally {
        $ErrorActionPreference = $oldErrorActionPreference

        if ($pushed) {
            Pop-Location
        }
    }
}

function Confirm-AndonDangerousAction {
    param(
        [string]$Message,
        [string]$ExpectedText = "APAGAR"
    )

    Write-Host ""
    Write-Host "ATENCAO:" -ForegroundColor Red
    Write-Host $Message -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Digite $ExpectedText para continuar"

    return ($confirm -eq $ExpectedText)
}

function Copy-AndonInstallTools {
    Write-AndonHeader "ANDON - COPIA SEGURA DO INSTALL-TOOLS"

    $source = "$Global:AndonProjectPath\install-tools"
    $target = $Global:AndonToolsPath

    if (!(Test-Path $source)) {
        Write-AndonWarn "Pasta install-tools nao encontrada em: $source"
        Write-AndonWarn "Mantendo ferramentas atuais, se existirem."
        return $false
    }

    New-Item -ItemType Directory -Force $target | Out-Null
    Copy-Item -Path "$source\*" -Destination $target -Recurse -Force

    Write-AndonOk "Ferramentas copiadas para: $target"
    return $true
}

function Invoke-AndonHealthCheck {
    $healthScript = "$Global:AndonToolsPath\05-verificar-saude-andon.ps1"

    if (Test-Path $healthScript) {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $healthScript
        return ($LASTEXITCODE -eq 0)
    }

    $fallbackHealthScript = "$Global:AndonProjectPath\scripts\health-check-andon.ps1"

    if (Test-Path $fallbackHealthScript) {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $fallbackHealthScript
        return ($LASTEXITCODE -eq 0)
    }

    Write-AndonFail "Nenhum script de health check encontrado."
    return $false
}

function Stop-AndonServicesSafe {
    $stopScript = "$Global:AndonToolsPath\01-parar-servicos-andon.ps1"

    if (Test-Path $stopScript) {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $stopScript
        return
    }

    Write-AndonWarn "Script de parada nao encontrado. Parando processos basicos."

    schtasks /Change /TN "$Global:AndonTaskWatchdog" /DISABLE 2>$null
    schtasks /Change /TN "$Global:AndonTaskBoot" /DISABLE 2>$null
    schtasks /Change /TN "$Global:AndonTaskKiosk" /DISABLE 2>$null

    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
}

function Start-AndonServicesSafe {
    $startScript = "$Global:AndonToolsPath\04-iniciar-servicos-andon.ps1"

    if (Test-Path $startScript) {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $startScript
        return
    }

    Write-AndonWarn "Script de iniciar servicos nao encontrado."
}

function Recreate-AndonTasksSafe {
    $tasksScript = "$Global:AndonToolsPath\09-recriar-tarefas-automaticas-andon.ps1"

    if (Test-Path $tasksScript) {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File $tasksScript
        return
    }

    Write-AndonWarn "Script de recriar tarefas nao encontrado."
}

function Create-AndonFirewallRules {
    Write-AndonHeader "ANDON - FIREWALL"

    Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

    New-NetFirewallRule `
        -DisplayName "ANDON Frontend 8080" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 8080 `
        -Action Allow | Out-Null

    New-NetFirewallRule `
        -DisplayName "ANDON API 3001" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort 3001 `
        -Action Allow | Out-Null

    Write-AndonOk "Regras de firewall criadas para portas 8080 e 3001."
}


function Get-AndonLocalIPv4Addresses {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Sort-Object InterfaceAlias, IPAddress

    return $addresses
}

function Test-AndonIPv4 {
    param([string]$IpAddress)

    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        return $false
    }

    $parsed = $null

    if (![System.Net.IPAddress]::TryParse($IpAddress, [ref]$parsed)) {
        return $false
    }

    return ($parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork)
}

function Save-AndonNetworkConfig {
    param([string]$ServerIp)

    if (!(Test-AndonIPv4 $ServerIp)) {
        Write-AndonFail "IP invalido: $ServerIp"
        return $false
    }

    New-Item -ItemType Directory -Force $Global:AndonInstallerPath | Out-Null

    $configPath = "$Global:AndonInstallerPath\andon-network.config.json"

    $config = [ordered]@{
        serverIp = $ServerIp
        apiUrl = "http://${ServerIp}:$Global:AndonApiPort"
        frontendUrl = "http://${ServerIp}:$Global:AndonFrontendPort"
        corsOrigins = "http://localhost:$Global:AndonFrontendPort,http://127.0.0.1:$Global:AndonFrontendPort,http://${ServerIp}:$Global:AndonFrontendPort"
    }

    $config | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8

    Write-AndonOk "Configuracao de rede salva em: $configPath"
    Write-Host "Servidor ANDON: $($config.serverIp)"
    Write-Host "API:            $($config.apiUrl)"
    Write-Host "Frontend:       $($config.frontendUrl)"
    Write-Host "CORS:           $($config.corsOrigins)"

    return $true
}

function Get-AndonNetworkConfig {
    $configPath = "$Global:AndonInstallerPath\andon-network.config.json"

    if (!(Test-Path $configPath)) {
        return $null
    }

    try {
        return Get-Content $configPath -Raw | ConvertFrom-Json
    } catch {
        Write-AndonWarn "Falha ao ler configuracao de rede: $($_.Exception.Message)"
        return $null
    }
}

function Select-AndonServerIp {
    Write-AndonHeader "ANDON - CONFIGURACAO DO IP DO SERVIDOR"

    $existingConfig = Get-AndonNetworkConfig

    if ($existingConfig -and $existingConfig.serverIp) {
        Write-Host "Configuracao atual encontrada:" -ForegroundColor Yellow
        Write-Host "IP atual:       $($existingConfig.serverIp)"
        Write-Host "API atual:      $($existingConfig.apiUrl)"
        Write-Host "Frontend atual: $($existingConfig.frontendUrl)"
        Write-Host ""

        $keep = Read-Host "Deseja manter este IP? S/N"

        if ($keep -eq "S" -or $keep -eq "s") {
            Write-AndonOk "IP mantido: $($existingConfig.serverIp)"
            return $existingConfig
        }
    }

    $addresses = @(Get-AndonLocalIPv4Addresses)

    if ($addresses.Count -eq 0) {
        Write-AndonWarn "Nenhum IPv4 de rede encontrado automaticamente."
        $manualIp = Read-Host "Digite manualmente o IP do servidor ANDON"

        if (!(Save-AndonNetworkConfig -ServerIp $manualIp)) {
            Write-AndonFail "Nao foi possivel salvar IP informado."
            exit 1
        }

        return Get-AndonNetworkConfig
    }

    Write-Host "IPs encontrados neste computador:" -ForegroundColor Cyan
    Write-Host ""

    for ($i = 0; $i -lt $addresses.Count; $i++) {
        $index = $i + 1
        Write-Host "$index - $($addresses[$i].IPAddress)  [$($addresses[$i].InterfaceAlias)]"
    }

    Write-Host ""
    Write-Host "M - Digitar IP manualmente"
    Write-Host ""

    $choice = Read-Host "Escolha o IP principal do servidor ANDON"

    if ($choice -eq "M" -or $choice -eq "m") {
        $manualIp = Read-Host "Digite manualmente o IP do servidor ANDON"

        if (!(Save-AndonNetworkConfig -ServerIp $manualIp)) {
            Write-AndonFail "Nao foi possivel salvar IP informado."
            exit 1
        }

        return Get-AndonNetworkConfig
    }

    $selectedIndex = 0

    if (![int]::TryParse($choice, [ref]$selectedIndex)) {
        Write-AndonFail "Opcao invalida."
        exit 1
    }

    if ($selectedIndex -lt 1 -or $selectedIndex -gt $addresses.Count) {
        Write-AndonFail "Opcao fora da lista."
        exit 1
    }

    $selectedIp = $addresses[$selectedIndex - 1].IPAddress

    if (!(Save-AndonNetworkConfig -ServerIp $selectedIp)) {
        Write-AndonFail "Nao foi possivel salvar IP selecionado."
        exit 1
    }

    return Get-AndonNetworkConfig
}

function Ensure-AndonNetworkConfig {
    $config = Get-AndonNetworkConfig

    if ($config -and $config.serverIp) {
        Write-AndonOk "Configuracao de rede encontrada: $($config.serverIp)"
        return $config
    }

    return Select-AndonServerIp
}

function Get-AndonInstallConfig {
    $defaultConfig = [ordered]@{
        postgresHost = "127.0.0.1"
        postgresPort = 5432
        databaseName = $Global:AndonDatabaseName
        databaseUser = $Global:AndonDatabaseUser
        apiPort = $Global:AndonApiPort
        frontendPort = $Global:AndonFrontendPort
    }

    if (!(Test-Path $Global:AndonConfigPath)) {
        return [pscustomobject]$defaultConfig
    }

    try {
        $fileConfig = Get-Content $Global:AndonConfigPath -Raw | ConvertFrom-Json

        foreach ($key in @("postgresHost", "postgresPort", "databaseName", "databaseUser", "apiPort", "frontendPort")) {
            if ($null -ne $fileConfig.$key -and "$($fileConfig.$key)".Trim() -ne "") {
                $defaultConfig[$key] = $fileConfig.$key
            }
        }

        return [pscustomobject]$defaultConfig
    } catch {
        Write-AndonWarn "Falha ao ler andon-config.json. Usando configuracao padrao. Erro: $($_.Exception.Message)"
        return [pscustomobject]$defaultConfig
    }
}

function Update-AndonGlobalsFromInstallConfig {
    param([object]$Config)

    if (!$Config) {
        return
    }

    $Global:AndonPostgresHost = "$($Config.postgresHost)"
    $Global:AndonPostgresPort = [int]$Config.postgresPort
    $Global:AndonDatabaseName = "$($Config.databaseName)"
    $Global:AndonDatabaseUser = "$($Config.databaseUser)"
    $Global:AndonApiPort = [int]$Config.apiPort
    $Global:AndonFrontendPort = [int]$Config.frontendPort
}

function Save-AndonInstallConfig {
    param([object]$Config)

    if (!$Config) {
        Write-AndonFail "Configuracao invalida."
        return $false
    }

    New-Item -ItemType Directory -Force $Global:AndonBasePath | Out-Null

    $configToSave = [ordered]@{
        postgresHost = "$($Config.postgresHost)"
        postgresPort = [int]$Config.postgresPort
        databaseName = "$($Config.databaseName)"
        databaseUser = "$($Config.databaseUser)"
        apiPort = [int]$Config.apiPort
        frontendPort = [int]$Config.frontendPort
    }

    $configToSave | ConvertTo-Json -Depth 5 | Set-Content -Path $Global:AndonConfigPath -Encoding UTF8

    Update-AndonGlobalsFromInstallConfig -Config ([pscustomobject]$configToSave)

    Write-AndonOk "Configuracao global salva em: $Global:AndonConfigPath"
    Write-Host "PostgreSQL:  $($configToSave.postgresHost):$($configToSave.postgresPort)"
    Write-Host "Banco:       $($configToSave.databaseName)"
    Write-Host "Usuario DB:  $($configToSave.databaseUser)"
    Write-Host "API:         $($configToSave.apiPort)"
    Write-Host "Frontend:    $($configToSave.frontendPort)"

    return $true
}

function Ensure-AndonInstallConfig {
    $config = Get-AndonInstallConfig

    if (!(Test-Path $Global:AndonConfigPath)) {
        Save-AndonInstallConfig -Config $config | Out-Null
    }

    Update-AndonGlobalsFromInstallConfig -Config $config

    return Get-AndonInstallConfig
}

function Select-AndonPostgresConfig {
    Write-AndonHeader "ANDON - CONFIGURACAO DO POSTGRESQL"

    $config = Get-AndonInstallConfig

    Write-Host "Configuracao atual:" -ForegroundColor Yellow
    Write-Host "Host PostgreSQL:  $($config.postgresHost)"
    Write-Host "Porta PostgreSQL: $($config.postgresPort)"
    Write-Host ""

    $portInput = Read-Host "Informe a porta do PostgreSQL [$($config.postgresPort)]"

    if ([string]::IsNullOrWhiteSpace($portInput)) {
        $port = [int]$config.postgresPort
    } else {
        $port = 0

        if (![int]::TryParse($portInput, [ref]$port)) {
            Write-AndonFail "Porta invalida: $portInput"
            return $null
        }

        if ($port -lt 1 -or $port -gt 65535) {
            Write-AndonFail "Porta fora do intervalo valido: $port"
            return $null
        }
    }

    $newConfig = [pscustomobject]@{
        postgresHost = "127.0.0.1"
        postgresPort = $port
        databaseName = "$($config.databaseName)"
        databaseUser = "$($config.databaseUser)"
        apiPort = [int]$config.apiPort
        frontendPort = [int]$config.frontendPort
    }

    if (!(Save-AndonInstallConfig -Config $newConfig)) {
        return $null
    }

    return Get-AndonInstallConfig
}

function Get-AndonDatabaseUrl {
    param([object]$Config)

    if (!$Config) {
        $Config = Ensure-AndonInstallConfig
    }

    return "postgresql://$($Config.databaseUser):$Global:AndonDatabasePassword@$($Config.postgresHost):$($Config.postgresPort)/$($Config.databaseName)?schema=public"
}

function Test-AndonPostgresAdminConnection {
    param(
        [string]$PostgresPassword,
        [int]$PostgresPort = 0
    )

    $config = Ensure-AndonInstallConfig

    if ($PostgresPort -le 0) {
        $PostgresPort = [int]$config.postgresPort
    }

    $psql = Get-AndonPsql

    if (!$psql) {
        Write-AndonFail "psql.exe nao encontrado."
        return $false
    }

    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $PostgresPassword

    try {
        Write-Host "Testando PostgreSQL em 127.0.0.1:$PostgresPort com usuario postgres..." -ForegroundColor Cyan

        & $psql `
            -h "127.0.0.1" `
            -p $PostgresPort `
            -U "postgres" `
            -d "postgres" `
            -c "SELECT version();" | Out-Host

        if ($LASTEXITCODE -ne 0) {
            Write-AndonFail "Falha ao autenticar no PostgreSQL."
            Write-Host "- A senha digitada deve ser a senha do usuario postgres do PostgreSQL." -ForegroundColor Yellow
            Write-Host "- Nao e a senha do Windows." -ForegroundColor Yellow
            Write-Host "- Teste manualmente com psql se necessario." -ForegroundColor Yellow
            return $false
        }

        Write-AndonOk "Conexao administrativa com PostgreSQL validada."
        return $true
    } finally {
        $env:PGPASSWORD = $oldPassword
    }
}

function Write-AndonBackendEnv {
    param(
        [object]$NetworkConfig = $null,
        [switch]$PreserveExisting,
        [switch]$ForceDatabaseUrl
    )

    $installConfig = Ensure-AndonInstallConfig

    if (!$NetworkConfig) {
        $NetworkConfig = Ensure-AndonNetworkConfig
    }

    $serverPath = "$Global:AndonProjectPath\server"
    $envPath = "$serverPath\.env"

    if (!(Test-Path $serverPath)) {
        Write-AndonFail "Pasta server nao encontrada em: $serverPath"
        return $false
    }

    $databaseUrl = Get-AndonDatabaseUrl -Config $installConfig

    if ($PreserveExisting -and (Test-Path $envPath)) {
        Write-AndonOk ".env existente preservado: $envPath"

        $envContent = Get-Content $envPath -Raw

        if ($envContent -notmatch "PORT=") {
            Add-Content -Path $envPath -Encoding UTF8 -Value "PORT=$($installConfig.apiPort)"
        }

        if ($envContent -notmatch "HOST=") {
            Add-Content -Path $envPath -Encoding UTF8 -Value "HOST=0.0.0.0"
        }

        if ($envContent -notmatch "DATABASE_URL=") {
            Add-Content -Path $envPath -Encoding UTF8 -Value "DATABASE_URL=`"$databaseUrl`""
            Write-AndonOk "DATABASE_URL adicionada ao .env existente."
        } elseif ($ForceDatabaseUrl) {
            $envContent = Get-Content $envPath -Raw
            $envContent = $envContent -replace 'DATABASE_URL=.*', "DATABASE_URL=`"$databaseUrl`""
            Set-Content -Path $envPath -Value $envContent -Encoding UTF8
            Write-AndonOk "DATABASE_URL atualizada no .env existente."
        } else {
            Write-AndonOk "DATABASE_URL existente preservada."
        }

        $envContent = Get-Content $envPath -Raw

        if ($envContent -notmatch "CORS_ORIGINS=") {
            Add-Content -Path $envPath -Encoding UTF8 -Value "CORS_ORIGINS=`"$($NetworkConfig.corsOrigins)`""
            Write-AndonOk "CORS_ORIGINS adicionado ao .env existente."
        } else {
            $newContent = $envContent -replace 'CORS_ORIGINS=.*', "CORS_ORIGINS=`"$($NetworkConfig.corsOrigins)`""
            Set-Content -Path $envPath -Value $newContent -Encoding UTF8
            Write-AndonOk "CORS_ORIGINS atualizado no .env existente."
        }

        return $true
    }

@"
PORT=$($installConfig.apiPort)
HOST=0.0.0.0
DATABASE_URL="$databaseUrl"
CORS_ORIGINS="$($NetworkConfig.corsOrigins)"
"@ | Set-Content -Path $envPath -Encoding UTF8

    Write-AndonOk ".env criado/atualizado em: $envPath"
    return $true
}

