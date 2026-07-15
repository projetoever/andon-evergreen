$ErrorActionPreference = "Stop"
$Global:AndonInstallerVersion = "1.0.0-pilot.1"

# ==================================================
# ANDON WEB INDUSTRIAL - INSTALLER COMMON 1.0.0-pilot.1
# Produto: Docker recomendado + PostgreSQL local avancado
# Fonte da verdade: C:\web-andon-industrial\andon-config.json
# ==================================================

$Global:AndonBasePath = "C:\web-andon-industrial"
$Global:AndonProjectPath = "$Global:AndonBasePath\andon"
$Global:AndonToolsPath = "$Global:AndonBasePath\andon-tools"
$Global:AndonInstallerPath = "$Global:AndonBasePath\installer"
$Global:AndonLogsPath = "$Global:AndonProjectPath\logs"
$Global:AndonBackupsPath = "$Global:AndonProjectPath\backups"
$Global:AndonChromeProfilePath = "$Global:AndonProjectPath\chrome-profile"
$Global:AndonConfigPath = "$Global:AndonBasePath\andon-config.json"
$Global:AndonNetworkConfigPath = "$Global:AndonInstallerPath\andon-network.config.json"

$Global:AndonRepoUrl = "https://github.com/projetoever/andon-evergreen.git"
$Global:AndonBranch = "main"

$Global:AndonApiPort = 3001
$Global:AndonFrontendPort = 8080

$Global:AndonPostgresHost = "127.0.0.1"
$Global:AndonPostgresPort = 5433
$Global:AndonDatabaseName = "andon_db"
$Global:AndonDatabaseUser = "andon"
$Global:AndonDatabasePassword = "andon_dev_password"
$Global:AndonDatabaseMode = "docker"

$Global:AndonDockerContainer = "andon-postgres"
$Global:AndonDockerVolume = "andon-postgres-data"
$Global:AndonDockerImage = "postgres:16-alpine"

$Global:AndonTaskBoot = "ANDON - Boot Servicos"
$Global:AndonTaskWatchdog = "ANDON - Watchdog Servicos"
$Global:AndonTaskKiosk = "ANDON - Chrome Kiosk"

function Write-AndonHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
}

function Write-AndonOk { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-AndonWarn { param([string]$Message) Write-Host "[AVISO] $Message" -ForegroundColor Yellow }
function Write-AndonFail { param([string]$Message) Write-Host "[FALHA] $Message" -ForegroundColor Red }

function Initialize-AndonFolders {
    New-Item -ItemType Directory -Force $Global:AndonBasePath | Out-Null
    New-Item -ItemType Directory -Force $Global:AndonInstallerPath | Out-Null
    New-Item -ItemType Directory -Force $Global:AndonToolsPath | Out-Null
    if (Test-Path $Global:AndonProjectPath) {
        New-Item -ItemType Directory -Force $Global:AndonLogsPath | Out-Null
        New-Item -ItemType Directory -Force $Global:AndonBackupsPath | Out-Null
        New-Item -ItemType Directory -Force $Global:AndonChromeProfilePath | Out-Null
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
    Write-AndonOk "PowerShell como Administrador."
}

function Read-AndonYesNo {
    param([string]$Question, [bool]$DefaultYes = $true)
    $suffix = if ($DefaultYes) { "[S/n]" } else { "[s/N]" }
    $answer = Read-Host "$Question $suffix"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    return @( "s", "sim", "y", "yes" ) -contains $answer.Trim().ToLowerInvariant()
}

function Confirm-AndonTyped {
    param([string]$Message, [string]$Expected = "APAGAR")
    Write-Host ""
    Write-Host "ATENCAO:" -ForegroundColor Red
    Write-Host $Message -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Digite $Expected para continuar"
    return ($confirm -eq $Expected)
}

function Read-AndonPort {
    param([string]$Question, [int]$DefaultPort)
    do {
        $value = Read-Host "$Question [$DefaultPort]"
        if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultPort }
        $port = 0
        if ([int]::TryParse($value, [ref]$port) -and $port -ge 1 -and $port -le 65535) { return $port }
        Write-AndonFail "Porta invalida: $value"
    } while ($true)
}

function Convert-AndonSecureStringToPlainText {
    param([securestring]$SecureString)
    if (!$SecureString) { return "" }
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-AndonCommandPath {
    param([string]$CommandName, [string]$InstallHint)
    $command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (!$command) { throw "$CommandName nao encontrado. $InstallHint" }
    return $command.Source
}

function Invoke-AndonProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = "",
        [string]$ErrorMessage = ""
    )
    $preview = if ($Arguments.Count -gt 0) { "$FilePath $($Arguments -join ' ')" } else { $FilePath }
    Write-Host ""
    Write-Host "Executando: $preview" -ForegroundColor DarkCyan
    $oldLocation = $null
    if ($WorkingDirectory) {
        if (!(Test-Path $WorkingDirectory)) { throw "Diretorio nao encontrado: $WorkingDirectory" }
        $oldLocation = Get-Location
        Set-Location $WorkingDirectory
    }
    try {
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            if ([string]::IsNullOrWhiteSpace($ErrorMessage)) { $ErrorMessage = "Comando falhou com codigo $exitCode`: $preview" }
            throw $ErrorMessage
        }
    } finally {
        if ($oldLocation) { Set-Location $oldLocation }
    }
}

function Invoke-AndonNativeSafe {
    param([scriptblock]$ScriptBlock)
    $oldEap = $ErrorActionPreference
    $hasNativePreference = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
    if ($hasNativePreference) { $oldNative = $PSNativeCommandUseErrorActionPreference }
    try {
        $ErrorActionPreference = "Continue"
        if ($hasNativePreference) { $PSNativeCommandUseErrorActionPreference = $false }
        & $ScriptBlock
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $oldEap
        if ($hasNativePreference) { $PSNativeCommandUseErrorActionPreference = $oldNative }
    }
}

function Test-AndonPortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return [bool]$conn
}

function Get-AndonMappedDockerPort {
    param([string]$ContainerName)
    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if (!$dockerCommand) { return $null }
    $docker = $dockerCommand.Source
    Invoke-AndonNativeSafe { & $docker container inspect $ContainerName 1>$null 2>$null } | Out-Null
    if ($LASTEXITCODE -ne 0) { return $null }
    $output = Invoke-AndonNativeSafe { & $docker port $ContainerName 5432/tcp 2>$null }
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($output)) { return $null }
    $first = @($output)[0]
    if ($first -match ":(\d+)$") { return [int]$Matches[1] }
    return $null
}

function Get-AndonDefaultConfig {
    return [pscustomobject]@{
        databaseMode = "docker"
        postgresHost = "127.0.0.1"
        postgresPort = 5433
        databaseName = "andon_db"
        databaseUser = "andon"
        databasePassword = "andon_dev_password"
        apiPort = 3001
        frontendPort = 8080
        projectPath = $Global:AndonProjectPath
        toolsPath = $Global:AndonToolsPath
        dockerContainer = $Global:AndonDockerContainer
        dockerVolume = $Global:AndonDockerVolume
    }
}

function Update-AndonGlobalsFromConfig {
    param([object]$Config)
    if (!$Config) { return }
    $Global:AndonDatabaseMode = "$($Config.databaseMode)"
    $Global:AndonPostgresHost = "$($Config.postgresHost)"
    $Global:AndonPostgresPort = [int]$Config.postgresPort
    $Global:AndonDatabaseName = "$($Config.databaseName)"
    $Global:AndonDatabaseUser = "$($Config.databaseUser)"
    $Global:AndonDatabasePassword = "$($Config.databasePassword)"
    $Global:AndonApiPort = [int]$Config.apiPort
    $Global:AndonFrontendPort = [int]$Config.frontendPort
    $Global:AndonProjectPath = "$($Config.projectPath)"
    $Global:AndonToolsPath = "$($Config.toolsPath)"
    if ($Config.dockerContainer) { $Global:AndonDockerContainer = "$($Config.dockerContainer)" }
    if ($Config.dockerVolume) { $Global:AndonDockerVolume = "$($Config.dockerVolume)" }
    $Global:AndonLogsPath = "$Global:AndonProjectPath\logs"
    $Global:AndonBackupsPath = "$Global:AndonProjectPath\backups"
    $Global:AndonChromeProfilePath = "$Global:AndonProjectPath\chrome-profile"
}

function Import-AndonConfig {
    $config = Get-AndonDefaultConfig
    if (Test-Path $Global:AndonConfigPath) {
        try {
            $fileConfig = Get-Content $Global:AndonConfigPath -Raw | ConvertFrom-Json
            foreach ($key in @("databaseMode","postgresHost","postgresPort","databaseName","databaseUser","databasePassword","apiPort","frontendPort","projectPath","toolsPath","dockerContainer","dockerVolume")) {
                if ($null -ne $fileConfig.$key -and "$($fileConfig.$key)".Trim() -ne "") { $config.$key = $fileConfig.$key }
            }
        } catch { Write-AndonWarn "Falha ao ler andon-config.json. Usando defaults. Erro: $($_.Exception.Message)" }
    }
    Update-AndonGlobalsFromConfig $config
    return $config
}

function Save-AndonConfig {
    param([object]$Config)
    if (!$Config) { throw "Config invalida." }
    Initialize-AndonFolders
    $configToSave = [ordered]@{
        databaseMode = "$($Config.databaseMode)"
        postgresHost = "$($Config.postgresHost)"
        postgresPort = [int]$Config.postgresPort
        databaseName = "$($Config.databaseName)"
        databaseUser = "$($Config.databaseUser)"
        databasePassword = "$($Config.databasePassword)"
        apiPort = [int]$Config.apiPort
        frontendPort = [int]$Config.frontendPort
        projectPath = "$($Config.projectPath)"
        toolsPath = "$($Config.toolsPath)"
        dockerContainer = "$($Config.dockerContainer)"
        dockerVolume = "$($Config.dockerVolume)"
    }
    $configToSave | ConvertTo-Json -Depth 6 | Set-Content $Global:AndonConfigPath -Encoding UTF8
    Update-AndonGlobalsFromConfig ([pscustomobject]$configToSave)
    Write-AndonOk "Config global salva: $Global:AndonConfigPath"
    Write-Host "databaseMode: $($configToSave.databaseMode)"
    Write-Host "PostgreSQL:    $($configToSave.postgresHost):$($configToSave.postgresPort)"
    Write-Host "Banco:         $($configToSave.databaseName)"
    Write-Host "Usuario DB:    $($configToSave.databaseUser)"
    Write-Host "API:           $($configToSave.apiPort)"
    Write-Host "Frontend:      $($configToSave.frontendPort)"
}

function Get-AndonNetworkConfig {
    if (!(Test-Path $Global:AndonNetworkConfigPath)) { return $null }
    try { return Get-Content $Global:AndonNetworkConfigPath -Raw | ConvertFrom-Json }
    catch { Write-AndonWarn "Falha ao ler configuracao de rede: $($_.Exception.Message)"; return $null }
}

function Test-AndonIPv4 {
    param([string]$IpAddress)
    if ([string]::IsNullOrWhiteSpace($IpAddress)) { return $false }
    $parsed = $null
    if (![System.Net.IPAddress]::TryParse($IpAddress, [ref]$parsed)) { return $false }
    return ($parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork)
}

function Save-AndonNetworkConfig {
    param([string]$ServerIp)
    if (!(Test-AndonIPv4 $ServerIp)) { throw "IP invalido: $ServerIp" }
    Initialize-AndonFolders
    $config = [ordered]@{
        serverIp = $ServerIp
        apiUrl = "http://${ServerIp}:$Global:AndonApiPort"
        frontendUrl = "http://${ServerIp}:$Global:AndonFrontendPort"
        corsOrigins = "http://localhost:$Global:AndonFrontendPort,http://127.0.0.1:$Global:AndonFrontendPort,http://${ServerIp}:$Global:AndonFrontendPort"
    }
    $config | ConvertTo-Json -Depth 5 | Set-Content $Global:AndonNetworkConfigPath -Encoding UTF8
    Write-AndonOk "Config de rede salva: $Global:AndonNetworkConfigPath"
    Write-Host "Frontend: $($config.frontendUrl)"
    Write-Host "API:      $($config.apiUrl)"
    return [pscustomobject]$config
}

function Get-AndonLocalIPv4Addresses {
    return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
        Sort-Object InterfaceAlias, IPAddress
}

function Select-AndonServerIp {
    Write-AndonHeader "IP DO SERVIDOR ANDON"
    $existing = Get-AndonNetworkConfig
    if ($existing -and $existing.serverIp) {
        Write-Host "IP atual: $($existing.serverIp)" -ForegroundColor Yellow
        if (Read-AndonYesNo "Manter este IP?" $true) { return $existing }
    }
    $addresses = @(Get-AndonLocalIPv4Addresses)
    if ($addresses.Count -gt 0) {
        for ($i = 0; $i -lt $addresses.Count; $i++) { Write-Host "$($i + 1) - $($addresses[$i].IPAddress) [$($addresses[$i].InterfaceAlias)]" }
        Write-Host "M - Digitar manualmente"
        do {
            $choice = Read-Host "Escolha o IP que Raspberry/clients vao acessar"
            if ($choice -eq "M" -or $choice -eq "m") { break }
            $idx = 0
            if ([int]::TryParse($choice, [ref]$idx) -and $idx -ge 1 -and $idx -le $addresses.Count) { return Save-AndonNetworkConfig -ServerIp $addresses[$idx - 1].IPAddress }
            Write-AndonFail "Opcao invalida."
        } while ($true)
    }
    do {
        $manualIp = Read-Host "Digite o IP do servidor ANDON"
        if (Test-AndonIPv4 $manualIp) { return Save-AndonNetworkConfig -ServerIp $manualIp }
        Write-AndonFail "IP invalido."
    } while ($true)
}

function Ensure-AndonNetworkConfig {
    $existing = Get-AndonNetworkConfig
    if ($existing -and $existing.serverIp) { return $existing }
    return Select-AndonServerIp
}

function Write-AndonBackendEnv {
    param([object]$Config = $null, [object]$NetworkConfig = $null)
    if (!$Config) { $Config = Import-AndonConfig }
    Update-AndonGlobalsFromConfig $Config
    if (!$NetworkConfig) { $NetworkConfig = Ensure-AndonNetworkConfig }
    $serverPath = "$Global:AndonProjectPath\server"
    if (!(Test-Path $serverPath)) { throw "Backend nao encontrado: $serverPath" }
    $databaseUrl = "postgresql://$($Config.databaseUser):$($Config.databasePassword)@$($Config.postgresHost):$($Config.postgresPort)/$($Config.databaseName)?schema=public"
    $envPath = "$serverPath\.env"
@"
PORT=$($Config.apiPort)
HOST=0.0.0.0
DATABASE_URL="$databaseUrl"
CORS_ORIGINS="$($NetworkConfig.corsOrigins)"
"@ | Set-Content $envPath -Encoding UTF8
    Write-AndonOk ".env gerado a partir do andon-config.json: $envPath"
}

function Get-AndonNpmCmd {
    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $default = "C:\Program Files\nodejs\npm.cmd"
    if (Test-Path $default) { return $default }
    return $null
}

function Get-AndonChromePath {
    $candidates = @("C:\Program Files\Google\Chrome\Application\chrome.exe", "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe")
    foreach ($candidate in $candidates) { if (Test-Path $candidate) { return $candidate } }
    $cmd = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Assert-AndonCorePrerequisites {
    Write-AndonHeader "VALIDACAO DE PRE-REQUISITOS GERAIS"
    $hasError = $false
    if (Test-AndonAdmin) { Write-AndonOk "PowerShell como Administrador." } else { Write-AndonFail "PowerShell nao esta como Administrador."; $hasError = $true }
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) { Write-AndonOk "Git: $($git.Source)" } else { Write-AndonFail "Git nao encontrado."; $hasError = $true }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) { Write-AndonOk "Node.js: $($node.Source)" } else { Write-AndonFail "Node.js nao encontrado."; $hasError = $true }
    $npm = Get-AndonNpmCmd
    if ($npm) { Write-AndonOk "npm.cmd: $npm" } else { Write-AndonFail "npm.cmd nao encontrado."; $hasError = $true }
    $chrome = Get-AndonChromePath
    if ($chrome) { Write-AndonOk "Chrome: $chrome" } else { Write-AndonWarn "Chrome nao encontrado. Kiosk local pode nao funcionar." }
    if ($hasError) { throw "Pre-requisitos gerais ausentes." }
}

function Sync-AndonRepositoryAndTools {
    Write-AndonHeader "REPOSITORIO E TOOLS"
    Initialize-AndonFolders
    $git = Get-AndonCommandPath "git.exe" "Instale Git for Windows."
    if (Test-Path "$Global:AndonProjectPath\.git") {
        Write-Host "Repositorio encontrado: $Global:AndonProjectPath"
        Invoke-AndonProcess $git @("-C", $Global:AndonProjectPath, "fetch", "--all", "--prune")
        Invoke-AndonProcess $git @("-C", $Global:AndonProjectPath, "checkout", $Global:AndonBranch)
        Invoke-AndonProcess $git @("-C", $Global:AndonProjectPath, "pull", "--ff-only", "origin", $Global:AndonBranch)
    } elseif (Test-Path $Global:AndonProjectPath) {
        throw "A pasta $Global:AndonProjectPath existe, mas nao e repositorio Git. Renomeie ou remova antes de continuar."
    } else {
        Invoke-AndonProcess $git @("clone", "--branch", $Global:AndonBranch, $Global:AndonRepoUrl, $Global:AndonProjectPath) $Global:AndonBasePath
    }
    New-Item -ItemType Directory -Force $Global:AndonToolsPath | Out-Null
    if (Test-Path "$Global:AndonProjectPath\install-tools") { Copy-Item "$Global:AndonProjectPath\install-tools\*" $Global:AndonToolsPath -Recurse -Force -ErrorAction SilentlyContinue }
    Write-AndonOk "Repositorio e tools sincronizados."
}

function Apply-AndonFirewallRules {
    Write-AndonHeader "FIREWALL"
    Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName "ANDON Frontend 8080" -Direction Inbound -Protocol TCP -LocalPort $Global:AndonFrontendPort -Action Allow | Out-Null
    New-NetFirewallRule -DisplayName "ANDON API 3001" -Direction Inbound -Protocol TCP -LocalPort $Global:AndonApiPort -Action Allow | Out-Null
    Write-AndonOk "Portas $Global:AndonFrontendPort e $Global:AndonApiPort liberadas."
}

function Clear-AndonChromeProfile {
    Remove-Item $Global:AndonChromeProfilePath -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $Global:AndonChromeProfilePath | Out-Null
    Write-AndonOk "Chrome profile limpo: $Global:AndonChromeProfilePath"
}

function Write-AndonRobustKioskScript {
    $scriptPath = "$Global:AndonProjectPath\scripts\open-kiosk-chrome.ps1"
    $scriptsPath = Split-Path -Parent $scriptPath
    if (!(Test-Path $scriptsPath)) { New-Item -ItemType Directory -Force $scriptsPath | Out-Null }
    $encodedKiosk = "JEVycm9yQWN0aW9uUHJlZmVyZW5jZSA9ICJDb250aW51ZSIKCiRCYXNlUGF0aCA9ICJDOlx3ZWItYW5kb24taW5kdXN0cmlhbCIKJFByb2plY3RQYXRoID0gIiRCYXNlUGF0aFxhbmRvbiIKJENocm9tZVByb2ZpbGVQYXRoID0gIiRQcm9qZWN0UGF0aFxjaHJvbWUtcHJvZmlsZSIKJExvZ3NQYXRoID0gIiRQcm9qZWN0UGF0aFxsb2dzIgokRnJvbnRVcmwgPSAiaHR0cDovLzEyNy4wLjAuMTo4MDgwIgoKTmV3LUl0ZW0gLUl0ZW1UeXBlIERpcmVjdG9yeSAtRm9yY2UgJENocm9tZVByb2ZpbGVQYXRoIHwgT3V0LU51bGwKTmV3LUl0ZW0gLUl0ZW1UeXBlIERpcmVjdG9yeSAtRm9yY2UgJExvZ3NQYXRoIHwgT3V0LU51bGwKCmZ1bmN0aW9uIFdyaXRlLUtpb3NrTG9nIHsKICAgIHBhcmFtKFtzdHJpbmddJE1lc3NhZ2UpCiAgICAkdGltZXN0YW1wID0gR2V0LURhdGUgLUZvcm1hdCAieXl5eS1NTS1kZCBISDptbTpzcyIKICAgICRsaW5lID0gIlskdGltZXN0YW1wXSAkTWVzc2FnZSIKICAgIFdyaXRlLUhvc3QgJGxpbmUKICAgIEFkZC1Db250ZW50IC1QYXRoICIkTG9nc1BhdGhca2lvc2subG9nIiAtVmFsdWUgJGxpbmUKfQoKZnVuY3Rpb24gVGVzdC1LaW9za0h0dHAgewogICAgcGFyYW0oW3N0cmluZ10kVXJsKQogICAgdHJ5IHsKICAgICAgICBJbnZva2UtV2ViUmVxdWVzdCAkVXJsIC1Vc2VCYXNpY1BhcnNpbmcgLVRpbWVvdXRTZWMgMyB8IE91dC1OdWxsCiAgICAgICAgcmV0dXJuICR0cnVlCiAgICB9IGNhdGNoIHsKICAgICAgICByZXR1cm4gJGZhbHNlCiAgICB9Cn0KCmZ1bmN0aW9uIEdldC1BbmRvbkNocm9tZVByb2Nlc3MgewogICAgR2V0LUNpbUluc3RhbmNlIFdpbjMyX1Byb2Nlc3MgLUZpbHRlciAibmFtZSA9ICdjaHJvbWUuZXhlJyIgLUVycm9yQWN0aW9uIFNpbGVudGx5Q29udGludWUgfAogICAgICAgIFdoZXJlLU9iamVjdCB7CiAgICAgICAgICAgICRfLkNvbW1hbmRMaW5lIC1saWtlICIqY2hyb21lLXByb2ZpbGUqIiAtb3IKICAgICAgICAgICAgJF8uQ29tbWFuZExpbmUgLWxpa2UgIiokQ2hyb21lUHJvZmlsZVBhdGgqIgogICAgICAgIH0KfQoKZnVuY3Rpb24gR2V0LUNocm9tZVBhdGggewogICAgJGNhbmRpZGF0ZXMgPSBAKAogICAgICAgICJDOlxQcm9ncmFtIEZpbGVzXEdvb2dsZVxDaHJvbWVcQXBwbGljYXRpb25cY2hyb21lLmV4ZSIsCiAgICAgICAgIkM6XFByb2dyYW0gRmlsZXMgKHg4NilcR29vZ2xlXENocm9tZVxBcHBsaWNhdGlvblxjaHJvbWUuZXhlIgogICAgKQoKICAgIGZvcmVhY2ggKCRjYW5kaWRhdGUgaW4gJGNhbmRpZGF0ZXMpIHsKICAgICAgICBpZiAoVGVzdC1QYXRoICRjYW5kaWRhdGUpIHsgcmV0dXJuICRjYW5kaWRhdGUgfQogICAgfQoKICAgICRjaHJvbWVDb21tYW5kID0gR2V0LUNvbW1hbmQgY2hyb21lLmV4ZSAtRXJyb3JBY3Rpb24gU2lsZW50bHlDb250aW51ZQogICAgaWYgKCRjaHJvbWVDb21tYW5kKSB7IHJldHVybiAkY2hyb21lQ29tbWFuZC5Tb3VyY2UgfQoKICAgIHJldHVybiAkbnVsbAp9CgpXcml0ZS1LaW9za0xvZyAiPT09PT0gQUJFUlRVUkEgS0lPU0sgQU5ET04gU09MSUNJVEFEQSA9PT09PSIKCiRleGlzdGluZyA9IEAoR2V0LUFuZG9uQ2hyb21lUHJvY2VzcykKaWYgKCRleGlzdGluZy5Db3VudCAtZ3QgMCkgewogICAgV3JpdGUtS2lvc2tMb2cgIkNocm9tZSBBTkRPTiBqYSBkZXRlY3RhZG8uIFJlaW5pY2lhbmRvIHBhcmEgZ2FyYW50aXIgdGVsYSB2aXNpdmVsLiIKICAgIGZvcmVhY2ggKCRwcm9jIGluICRleGlzdGluZykgewogICAgICAgIFdyaXRlLUtpb3NrTG9nICJGaW5hbGl6YW5kbyBDaHJvbWUgQU5ET04gUElEICQoJHByb2MuUHJvY2Vzc0lkKSIKICAgICAgICBTdG9wLVByb2Nlc3MgLUlkICRwcm9jLlByb2Nlc3NJZCAtRm9yY2UgLUVycm9yQWN0aW9uIFNpbGVudGx5Q29udGludWUKICAgIH0KICAgIFN0YXJ0LVNsZWVwIC1TZWNvbmRzIDIKfQoKV3JpdGUtS2lvc2tMb2cgIkFndWFyZGFuZG8gZnJvbnRlbmQgZW0gJEZyb250VXJsLi4uIgoKJGZyb250ZW5kUmVhZHkgPSAkZmFsc2UKZm9yICgkaSA9IDE7ICRpIC1sZSA5MDsgJGkrKykgewogICAgaWYgKFRlc3QtS2lvc2tIdHRwICRGcm9udFVybCkgewogICAgICAgICRmcm9udGVuZFJlYWR5ID0gJHRydWUKICAgICAgICBXcml0ZS1LaW9za0xvZyAiRnJvbnRlbmQgZGlzcG9uaXZlbC4iCiAgICAgICAgYnJlYWsKICAgIH0KICAgIFN0YXJ0LVNsZWVwIC1TZWNvbmRzIDIKfQoKaWYgKCEkZnJvbnRlbmRSZWFkeSkgewogICAgV3JpdGUtS2lvc2tMb2cgIkFWSVNPOiBmcm9udGVuZCBuYW8gcmVzcG9uZGV1IG5vIHRlbXBvIGxpbWl0ZS4gVGVudGFuZG8gYWJyaXIgbWVzbW8gYXNzaW0uIgp9CgokY2hyb21lUGF0aCA9IEdldC1DaHJvbWVQYXRoCgppZiAoJGNocm9tZVBhdGgpIHsKICAgIFdyaXRlLUtpb3NrTG9nICJDaHJvbWUgZW5jb250cmFkbyBlbTogJGNocm9tZVBhdGgiCiAgICBXcml0ZS1LaW9za0xvZyAiQWJyaW5kbyBBTkRPTiBlbSBtb2RvIGtpb3NrLiIKICAgIFN0YXJ0LVByb2Nlc3MgLUZpbGVQYXRoICRjaHJvbWVQYXRoIC1Bcmd1bWVudExpc3QgQCgKICAgICAgICAiLS1raW9zayIsCiAgICAgICAgIi0tbmV3LXdpbmRvdyIsCiAgICAgICAgJEZyb250VXJsLAogICAgICAgICItLXVzZXItZGF0YS1kaXI9JENocm9tZVByb2ZpbGVQYXRoIiwKICAgICAgICAiLS1uby1maXJzdC1ydW4iLAogICAgICAgICItLWRpc2FibGUtaW5mb2JhcnMiLAogICAgICAgICItLWRpc2FibGUtc2Vzc2lvbi1jcmFzaGVkLWJ1YmJsZSIsCiAgICAgICAgIi0tZGlzYWJsZS1mZWF0dXJlcz1UcmFuc2xhdGUiLAogICAgICAgICItLW92ZXJzY3JvbGwtaGlzdG9yeS1uYXZpZ2F0aW9uPTAiLAogICAgICAgICItLWRpc2FibGUtcGluY2giCiAgICApCn0gZWxzZSB7CiAgICBXcml0ZS1LaW9za0xvZyAiQ2hyb21lIG5hbyBlbmNvbnRyYWRvLiBBYnJpbmRvIG5hdmVnYWRvciBwYWRyYW8uIgogICAgU3RhcnQtUHJvY2VzcyAkRnJvbnRVcmwKfQoKU3RhcnQtU2xlZXAgLVNlY29uZHMgOAoKJGFmdGVyID0gQChHZXQtQW5kb25DaHJvbWVQcm9jZXNzKQppZiAoJGFmdGVyLkNvdW50IC1ndCAwKSB7CiAgICBXcml0ZS1LaW9za0xvZyAiS2lvc2sgQU5ET04gZGV0ZWN0YWRvIGFwb3MgYWJlcnR1cmEuIFBJRHM6ICQoJGFmdGVyLlByb2Nlc3NJZCAtam9pbiAnLCAnKSIKICAgIGV4aXQgMAp9CgpXcml0ZS1LaW9za0xvZyAiRkFMSEE6IENocm9tZSBLaW9zayBuYW8gZGV0ZWN0YWRvIGFwb3MgdGVudGF0aXZhIGRlIGFiZXJ0dXJhLiIKZXhpdCAyCg=="
    $bytes = [Convert]::FromBase64String($encodedKiosk)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    Set-Content -Path $scriptPath -Value $content -Encoding UTF8
    Write-AndonOk "Script Kiosk robusto atualizado: $scriptPath"
}

function Test-AndonHttpReady {
    param([string]$Url, [int]$TimeoutSeconds = 90)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true }
        catch { Start-Sleep -Seconds 2 }
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Get-AndonKioskProcess {
    Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*C:\web-andon-industrial\andon\chrome-profile*" }
}

function Invoke-AndonNodePipeline {
    param([bool]$RunSeed = $false, [bool]$InstallDependencies = $true)
    $config = Import-AndonConfig
    $networkConfig = Ensure-AndonNetworkConfig
    Write-AndonBackendEnv -Config $config -NetworkConfig $networkConfig
    $npm = Get-AndonNpmCmd
    if (!$npm) { throw "npm.cmd nao encontrado." }
    $serverPath = "$Global:AndonProjectPath\server"
    if (!(Test-Path $serverPath)) { throw "Backend nao encontrado: $serverPath" }
    Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
    if ($InstallDependencies) { Invoke-AndonProcess $npm @("install", "--include=dev", "--no-audit", "--no-fund") $serverPath }
    Invoke-AndonProcess $npm @("run", "db:generate") $serverPath
    Invoke-AndonProcess $npm @("run", "db:migrate") $serverPath
    if ($RunSeed) { Write-AndonWarn "Instalacao limpa: db:seed sera executado."; Invoke-AndonProcess $npm @("run", "db:seed") $serverPath } else { Write-AndonOk "db:seed nao sera executado neste procedimento." }
    Invoke-AndonProcess $npm @("run", "build") $serverPath
    Remove-Item "$Global:AndonProjectPath\dist" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:\VITE_ANDON_API_BASE_URL -ErrorAction SilentlyContinue
    $env:VITE_ANDON_DATA_MODE = "api"
    $env:VITE_ANDON_API_PORT = "$($config.apiPort)"
    try {
        if ($InstallDependencies) { Invoke-AndonProcess $npm @("install", "--include=dev", "--no-audit", "--no-fund") $Global:AndonProjectPath }
        Invoke-AndonProcess $npm @("run", "build") $Global:AndonProjectPath
    } finally {
        Remove-Item Env:\VITE_ANDON_DATA_MODE -ErrorAction SilentlyContinue
        Remove-Item Env:\VITE_ANDON_API_PORT -ErrorAction SilentlyContinue
    }
    if (!(Test-Path "$Global:AndonProjectPath\dist\client\assets")) { throw "Build frontend nao gerou dist\client\assets." }
    Write-AndonOk "Backend/frontend preparados."
}

function Test-AndonApiWrite {
    $api = "http://127.0.0.1:$Global:AndonApiPort"
    try { $machines = Invoke-RestMethod "$api/api/machines?includeInactive=true" -TimeoutSec 10 }
    catch { Write-AndonWarn "Teste de escrita pulado: nao foi possivel listar maquinas pela API."; return $false }
    $machine = $machines | Where-Object { $_.currentCallId -eq $null } | Select-Object -First 1
    if (!$machine) { Write-AndonWarn "Teste de escrita pulado: nenhuma maquina livre."; return $false }
    $payload = @{ machineId = "$($machine.id)"; category = "maintenance"; subtype = "mechanical"; criticality = "medium"; machineCondition = "running"; description = "Chamado temporario criado pelo health check do instalador"; createdBy = "installer-health"; origin = "installer_health_check"; isSystemTest = $true } | ConvertTo-Json
    try {
        $call = Invoke-RestMethod "$api/api/andon-calls" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 10
        $cancelPayload = @{ reason = "Teste automatico do instalador"; cancelledBy = "installer-health" } | ConvertTo-Json
        Invoke-RestMethod "$api/api/andon-calls/$($call.id)/cancel" -Method Patch -ContentType "application/json" -Body $cancelPayload -TimeoutSec 10 | Out-Null
        Write-AndonOk "Teste real de escrita API aprovado."
        return $true
    } catch { Write-AndonWarn "Teste real de escrita API falhou: $($_.Exception.Message)"; return $false }
}

function Remove-AndonTasks {
    foreach ($taskName in @("ANDON - Inicializacao Automatica", $Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) {
        try { $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; if ($task) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; Write-AndonOk "Tarefa removida: $taskName" } } catch { Write-AndonWarn "Nao foi possivel remover tarefa $taskName." }
    }
}

function Remove-AndonFirewallRules {
    Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-AndonOk "Regras de firewall removidas, se existiam."
}

function Show-AndonStatus {
    Write-AndonHeader "STATUS RAPIDO"
    Write-Host "Base oficial:  $Global:AndonBasePath"
    Write-Host "Projeto/app:   $Global:AndonProjectPath"
    Write-Host "Tools:         $Global:AndonToolsPath"
    Write-Host "Installer:     $Global:AndonInstallerPath"
    Write-Host "Config global: $Global:AndonConfigPath"
    Write-Host ""
    $config = Import-AndonConfig
    if (Test-Path $Global:AndonConfigPath) {
        Write-Host "databaseMode:  $($config.databaseMode)"
        Write-Host "PostgreSQL:    $($config.postgresHost):$($config.postgresPort)"
        Write-Host "Database:      $($config.databaseName)"
        Write-Host "API:           $($config.apiPort)"
        Write-Host "Frontend:      $($config.frontendPort)"
    } else { Write-AndonWarn "andon-config.json ainda nao existe." }
    Write-Host ""
    $ports = @($Global:AndonApiPort, $Global:AndonFrontendPort, [int]$config.postgresPort) | Select-Object -Unique
    foreach ($port in $ports) { if (Test-AndonPortInUse $port) { Write-Host "[USO]   Porta $port" -ForegroundColor Yellow } else { Write-Host "[LIVRE] Porta $port" -ForegroundColor Green } }
    Write-Host ""
    $tasks = Get-ScheduledTask -TaskName "ANDON*" -ErrorAction SilentlyContinue
    if ($tasks) { $tasks | Select-Object TaskName, State | Format-Table -AutoSize } else { Write-AndonWarn "Nenhuma tarefa ANDON encontrada." }
}
