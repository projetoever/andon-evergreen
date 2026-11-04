# Shared routing for the normal Windows installer menu (2/4/5/6).
# The factory Windows Server ALWAYS uses its installed transport configuration
# and the existing industrial runtime. This local profile never touches it.
function Test-AndonLocalHttpsProfile {
    param([Parameter(Mandatory = $true)][string]$ProjectRoot)

    # Failure to query Windows product type must never switch the industrial
    # server into the local synthetic database profile.
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    } catch {
        return $false
    }
    if ([int]$os.ProductType -ne 1) { return $false }

    $stateRoot = Join-Path $ProjectRoot ".andon-homologation"
    $configPath = Join-Path $stateRoot "config.json"
    foreach ($required in @(
        $configPath,
        (Join-Path $stateRoot "localhost.pem"),
        (Join-Path $stateRoot "localhost-key.pem")
    )) {
        if (!(Test-Path $required -PathType Leaf)) { return $false }
    }
    try {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        return ([int]$config.postgresPort -eq 55432 -and
            ![string]::IsNullOrWhiteSpace([string]$config.databasePassword))
    } catch {
        return $false
    }
}

function Test-AndonLocalHttpsReady {
    foreach ($url in @("https://localhost:3001/health", "https://localhost:8080/hub")) {
        try {
            $result = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ([int]$result.StatusCode -lt 200 -or [int]$result.StatusCode -ge 400) {
                return $false
            }
        } catch {
            return $false
        }
    }
    return $true
}

function Invoke-AndonLocalHttpsProfile {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][ValidateSet("Start", "Stop", "Health")][string]$Action
    )
    if (!(Test-AndonLocalHttpsProfile -ProjectRoot $ProjectRoot)) {
        throw "Perfil HTTPS local nao configurado. Use o assistente HTTPS da opcao 14."
    }
    $stateRoot = Join-Path $ProjectRoot ".andon-homologation"
    $stop = Join-Path $ProjectRoot "homologation\https\Stop-AndonHttpsHomologation.ps1"
    $start = Join-Path $ProjectRoot "homologation\https\Start-AndonHttpsHomologation.ps1"
    $clear = Join-Path $ProjectRoot "homologation\https\Clear-AndonLocalHttpsPorts.ps1"
    $stateFile = Join-Path $stateRoot "processes.json"

    if ($Action -eq "Health") {
        if (!(Test-AndonLocalHttpsReady)) {
            throw "ANDON HTTPS local indisponivel. Use a opcao 4. Logs: $stateRoot"
        }
        Write-Host "ANDON HTTPS ativo: https://localhost:8080/hub" -ForegroundColor Green
        Write-Host "API HTTPS ativa: https://localhost:3001/health" -ForegroundColor Green
        return
    }
    if ($Action -eq "Stop") {
        & $stop
        if (Test-Path $clear -PathType Leaf) {
            . $clear
            Clear-AndonLocalHttpsPorts -ProjectRoot $ProjectRoot -StateRoot $stateRoot
        }
        Write-Host "ANDON HTTPS parado. Banco de testes e certificados preservados." -ForegroundColor Green
        return
    }

    if (Test-AndonLocalHttpsReady) {
        Write-Host "ANDON HTTPS ja esta em execucao." -ForegroundColor Green
        Write-Host "Hub: https://localhost:8080/hub"
        return
    }

    # Only the test profile's own tracked launcher may be stopped; other
    # listeners are checked against verified ANDON entrypoints before changes.
    if (Test-Path $stateFile -PathType Leaf) { & $stop }
    if (!(Test-Path $clear -PathType Leaf)) {
        throw "Rotina de liberacao de portas HTTPS nao encontrada. Atualize pela main."
    }
    . $clear
    Clear-AndonLocalHttpsPorts -ProjectRoot $ProjectRoot -StateRoot $stateRoot
    & $start -FrontendPort 8080 -ApiPort 3001 -PostgresPort 55432 `
        -EnableCentralOperationalWrites -EnableGlobalPaletteWrites `
        -NotebookStandardPorts

    if (!(Test-AndonLocalHttpsReady)) {
        throw "Inicializacao HTTPS retornou, mas a API ou o Hub nao respondeu. Consulte os logs em $stateRoot"
    }
    $marker = Join-Path $stateRoot "notebook-standard-ports.enabled"
    Set-Content -Path $marker -Value "https://localhost:8080/hub" -Encoding ASCII
    Write-Host "Opcao 4: Hub HTTPS ativo em https://localhost:8080/hub" -ForegroundColor Green
}
