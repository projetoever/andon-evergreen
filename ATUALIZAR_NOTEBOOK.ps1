[CmdletBinding()]
param(
    [switch]$SemGitPull
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $repoRoot "homologation\https\Start-AndonHttpsHomologation.ps1"
$stopScript = Join-Path $repoRoot "homologation\https\Stop-AndonHttpsHomologation.ps1"
$stateFile = Join-Path $repoRoot ".andon-homologation\processes.json"

# This is NOT the Windows Server installer. An explicit local workstation
# guard prevents accidentally switching the production host to a test profile.
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
if ([int]$os.ProductType -ne 1) {
    throw "Esta rotina e exclusiva para notebook/Windows cliente. No servidor industrial, utilize o instalador e o procedimento de homologacao da fabrica."
}

if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw "Git nao encontrado. A atualizacao automatica da main nao pode prosseguir."
}
if (!(Test-Path (Join-Path $repoRoot ".git"))) {
    throw "Execute a rotina na copia Git do ANDON no notebook, nao em uma pasta de instalacao sem repositorio."
}

Push-Location $repoRoot
try {
    $origin = (& git.exe remote get-url origin 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or
        $origin -notmatch '(?i)github\.com[:/]projetoever/andon-evergreen(?:\.git)?/?$') {
        throw "Origem Git inesperada. Verifique o repositorio projetoever/andon-evergreen antes de atualizar."
    }

    # Do not overwrite local work or force-checkout an experimental branch.
    $dirty = @(& git.exe status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
        throw "Ha alteracoes locais no repositorio. Faca commit/stash antes de atualizar; nada sera descartado automaticamente."
    }

    if (!$SemGitPull) {
        & git.exe checkout main
        if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel acessar a branch main." }
        & git.exe pull --ff-only origin main
        if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar a main sem reescrita de historico." }
    } elseif ((& git.exe branch --show-current | Out-String).Trim() -ne "main") {
        throw "-SemGitPull exige que a branch atual ja seja main."
    }

    $commit = (& git.exe rev-parse --short HEAD | Out-String).Trim()
    Write-Host "Codigo do notebook: main ($commit)" -ForegroundColor Cyan

    # Only stop a prior HTTPS test instance identified by its own state file.
    # Neither the industrial installer nor arbitrary processes are killed.
    if (Test-Path $stateFile) {
        & $stopScript
        if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel encerrar a homologacao anterior com seguranca." }
    }

    if (!(Test-Path $startScript -PathType Leaf)) {
        throw "Launcher HTTPS nao encontrado depois da atualizacao da main."
    }

    # Synthetic Docker database and real TLS, but exactly the usual ports.
    # All central operational + palette write gates are ON only in this
    # loopback, Windows-client test process. PLC/GPIO write channels stay OFF.
    & $startScript -FrontendPort 8080 -ApiPort 3001 -PostgresPort 55432 `
        -EnableCentralOperationalWrites -EnableGlobalPaletteWrites `
        -NotebookStandardPorts

    Write-Host ""
    Write-Host "Notebook: https://localhost:8080/hub" -ForegroundColor Green
    Write-Host "API HTTPS: https://localhost:3001" -ForegroundColor Green
    Write-Host "Identidades Node-RED/GPIO: somente API de leitura; nenhum hardware conectado." -ForegroundColor Yellow
    Write-Host "Banco de homologacao preservado. Nenhuma alteracao aplicada ao servidor Evergreen." -ForegroundColor Yellow
} finally {
    Pop-Location
}
