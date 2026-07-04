$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"
$ConfigPath = "$BasePath\andon-config.json"
$ChromeProfilePath = "$ProjectPath\chrome-profile"

$ApiPort = 3001
$FrontendPort = 8080
$PostgresHost = "127.0.0.1"
$PostgresPort = 5432
$DatabaseName = "andon_db"
$DatabaseUser = "andon"

$hasError = $false

if (Test-Path $ConfigPath) {
    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

        if ($config.apiPort) {
            $ApiPort = [int]$config.apiPort
        }

        if ($config.frontendPort) {
            $FrontendPort = [int]$config.frontendPort
        }

        if ($config.postgresHost) {
            $PostgresHost = "$($config.postgresHost)"
        }

        if ($config.postgresPort) {
            $PostgresPort = [int]$config.postgresPort
        }

        if ($config.databaseName) {
            $DatabaseName = "$($config.databaseName)"
        }

        if ($config.databaseUser) {
            $DatabaseUser = "$($config.databaseUser)"
        }
    } catch {
        Write-Host "[AVISO] Falha ao ler $ConfigPath. Usando padroes." -ForegroundColor Yellow
    }
}

Write-Host "===== ANDON - HEALTH CHECK ====="

Write-Host ""
Write-Host "Configuracao:"
Write-Host "Base:       $BasePath"
Write-Host "Projeto:    $ProjectPath"
Write-Host "API:        http://localhost:$ApiPort"
Write-Host "Frontend:   http://127.0.0.1:$FrontendPort"
Write-Host "PostgreSQL: $PostgresHost`:$PostgresPort"
Write-Host "Banco:      $DatabaseName"
Write-Host "Usuario DB: $DatabaseUser"

Write-Host ""
Write-Host "0. Conferindo arquivos de build..."

$ApiBuild = "$ProjectPath\server\dist\server.js"
$FrontBuild = "$ProjectPath\dist"

if (Test-Path $ApiBuild) {
    Write-Host "[OK] Build API: $ApiBuild" -ForegroundColor Green
} else {
    Write-Host "[FALHA] Build da API nao encontrado: $ApiBuild" -ForegroundColor Red
    $hasError = $true
}

if (Test-Path $FrontBuild) {
    Write-Host "[OK] Build frontend: $FrontBuild" -ForegroundColor Green
} else {
    Write-Host "[FALHA] Build frontend nao encontrado: $FrontBuild" -ForegroundColor Red
    $hasError = $true
}

Write-Host ""
Write-Host "1. API /health"

try {
    Invoke-RestMethod "http://localhost:$ApiPort/health" -TimeoutSec 5 | Out-Null
    Write-Host "[OK] API respondeu" -ForegroundColor Green
} catch {
    Write-Host "[FALHA] API nao respondeu em http://localhost:$ApiPort/health" -ForegroundColor Red
    $hasError = $true
}

Write-Host ""
Write-Host "2. Banco via API /health/db"

try {
    Invoke-RestMethod "http://localhost:$ApiPort/health/db" -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Banco respondeu via API" -ForegroundColor Green
} catch {
    Write-Host "[FALHA] Banco/API nao respondeu em http://localhost:$ApiPort/health/db" -ForegroundColor Red
    $hasError = $true
}

Write-Host ""
Write-Host "3. Frontend"

try {
    Invoke-WebRequest "http://127.0.0.1:$FrontendPort" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Frontend respondeu" -ForegroundColor Green
} catch {
    Write-Host "[FALHA] Frontend nao respondeu em http://127.0.0.1:$FrontendPort" -ForegroundColor Red
    $hasError = $true
}

Write-Host ""
Write-Host "4. Portas"

foreach ($portInfo in @(
    @{ Name = "API"; Port = $ApiPort },
    @{ Name = "Frontend"; Port = $FrontendPort },
    @{ Name = "PostgreSQL"; Port = $PostgresPort }
)) {
    $connections = Get-NetTCPConnection -LocalPort $portInfo.Port -ErrorAction SilentlyContinue

    if ($connections) {
        Write-Host "[OK] Porta $($portInfo.Port) em uso - $($portInfo.Name)" -ForegroundColor Green
        $connections | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
    } else {
        Write-Host "[FALHA] Porta $($portInfo.Port) nao esta em uso - $($portInfo.Name)" -ForegroundColor Red
        $hasError = $true
    }
}

Write-Host ""
Write-Host "5. Processos Node"

$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    $nodeProcesses | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
} else {
    Write-Host "[AVISO] Nenhum processo node encontrado." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "6. Chrome associado ao ANDON"

$chromeProcesses = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$ChromeProfilePath*" }

if ($chromeProcesses) {
    $chromeProcesses |
        Select-Object ProcessId, CommandLine |
        Format-List
} else {
    Write-Host "[AVISO] Chrome kiosk ANDON nao encontrado." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "7. Tarefas ANDON"

$taskOutput = schtasks /Query | findstr ANDON

if ($taskOutput) {
    $taskOutput
} else {
    Write-Host "[AVISO] Nenhuma tarefa ANDON encontrada." -ForegroundColor Yellow
}

Write-Host ""

if ($hasError) {
    Write-Host "===== HEALTH CHECK REPROVADO =====" -ForegroundColor Red
    exit 1
}

Write-Host "===== HEALTH CHECK APROVADO =====" -ForegroundColor Green
exit 0
