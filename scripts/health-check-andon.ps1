$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"
$ConfigPath = "$BasePath\andon-config.json"
$ChromeProfilePath = "$ProjectPath\chrome-profile"
$NodeRuntimePath = "$BasePath\runtime\node"
$AndonNodePath = "$NodeRuntimePath\node.exe"
$AndonNpmPath = "$NodeRuntimePath\npm.cmd"
$ExpectedNodeVersion = "v22.23.2"

$ApiPort = 3001
$FrontendPort = 8080
$PostgresHost = "127.0.0.1"
$PostgresPort = 5432
$DatabaseName = "andon_web_industrial"
$DatabaseUser = "andon_web"
$DatabaseMode = "local"

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

        if ($config.databaseMode) {
            $DatabaseMode = "$($config.databaseMode)"
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

if ($DatabaseMode -eq "local" -and $DatabaseName.ToLowerInvariant() -eq "andon_db") {
    Write-Host "[FALHA] O banco local legado andon_db e protegido e nao pode ser usado pelo ANDON." -ForegroundColor Red
    $hasError = $true
}

Write-Host ""
Write-Host "Runtime Node:"
if ((Test-Path $AndonNodePath -PathType Leaf) -and (Test-Path $AndonNpmPath -PathType Leaf)) {
    $andonNodeVersion = & $AndonNodePath --version 2>$null
    if ($LASTEXITCODE -eq 0 -and "$andonNodeVersion".Trim() -eq $ExpectedNodeVersion) {
        Write-Host "[OK] Node ANDON: $AndonNodePath" -ForegroundColor Green
        Write-Host "Versao: $andonNodeVersion"
    } else {
        Write-Host "[FALHA] Node ANDON invalido: $AndonNodePath. Esperado: $ExpectedNodeVersion. Encontrado: $andonNodeVersion" -ForegroundColor Red
        $hasError = $true
    }
} else {
    Write-Host "[FALHA] Node/npm ANDON nao encontrados em $NodeRuntimePath" -ForegroundColor Red
    $hasError = $true
}

$globalNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($globalNode) {
    $globalVersion = & $globalNode.Source --version 2>$null
    Write-Host "Node global (somente informativo): $($globalNode.Source) ($globalVersion)"
} else {
    Write-Host "Node global (somente informativo): nao encontrado"
}
Write-Host "O Node global nao e usado pelo ANDON quando o runtime dedicado esta disponivel."

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
Write-Host "5. Processos Node do ANDON"

$nodeProcesses = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.ExecutablePath -eq $AndonNodePath -or
        $_.CommandLine -like "*$ProjectPath*"
    }

if ($nodeProcesses) {
    $nodeProcesses | Select-Object ProcessId, ExecutablePath, CommandLine | Format-List
} else {
    Write-Host "[AVISO] Nenhum processo Node do ANDON encontrado." -ForegroundColor Yellow
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
