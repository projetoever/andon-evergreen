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
    $psql = "$Global:AndonPostgresBinPath\psql.exe"

    if (Test-Path $psql) {
        return $psql
    }

    return $null
}

function Get-AndonPgDump {
    $pgDump = "$Global:AndonPostgresBinPath\pg_dump.exe"

    if (Test-Path $pgDump) {
        return $pgDump
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

    if ($WorkingDirectory -and (Test-Path $WorkingDirectory)) {
        Push-Location $WorkingDirectory
    }

    try {
        cmd.exe /c $Command
        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            Write-AndonFail "Comando falhou com codigo ${exitCode}: $Command"
            if ($WorkingDirectory) {
                Pop-Location
            }
            return $false
        }

        Write-AndonOk "Comando concluido: $Command"

        if ($WorkingDirectory) {
            Pop-Location
        }

        return $true
    } catch {
        Write-AndonFail "Erro ao executar comando: $($_.Exception.Message)"

        if ($WorkingDirectory) {
            Pop-Location
        }

        return $false
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

function Write-AndonBackendEnv {
    param(
        [switch]$PreserveExisting
    )

    $networkConfig = Ensure-AndonNetworkConfig

    $serverPath = "$Global:AndonProjectPath\server"
    $envPath = "$serverPath\.env"

    if (!(Test-Path $serverPath)) {
        Write-AndonFail "Pasta server nao encontrada em: $serverPath"
        return $false
    }

    if ($PreserveExisting -and (Test-Path $envPath)) {
        Write-AndonOk ".env existente preservado: $envPath"

        $envContent = Get-Content $envPath -Raw

        if ($envContent -notmatch "CORS_ORIGINS=") {
            Add-Content -Path $envPath -Encoding UTF8 -Value "CORS_ORIGINS=`"$($networkConfig.corsOrigins)`""
            Write-AndonOk "CORS_ORIGINS adicionado ao .env existente."
        } else {
            $newContent = $envContent -replace 'CORS_ORIGINS=.*', "CORS_ORIGINS=`"$($networkConfig.corsOrigins)`""
            Set-Content -Path $envPath -Value $newContent -Encoding UTF8
            Write-AndonOk "CORS_ORIGINS atualizado no .env existente."
        }

        return $true
    }

@"
PORT=$Global:AndonApiPort
HOST=0.0.0.0
DATABASE_URL="postgresql://$Global:AndonDatabaseUser`:$Global:AndonDatabasePassword@localhost:$Global:AndonPostgresPort/$Global:AndonDatabaseName`?schema=public"
CORS_ORIGINS="$($networkConfig.corsOrigins)"
"@ | Set-Content -Path $envPath -Encoding UTF8

    Write-AndonOk ".env criado/atualizado em: $envPath"
    return $true
}
