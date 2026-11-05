[CmdletBinding()]
param(
    [switch]$SemGitPull
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stopScript = Join-Path $repoRoot "homologation\https\Stop-AndonHttpsHomologation.ps1"
$stateRoot = Join-Path $repoRoot ".andon-homologation"
$stateFile = Join-Path $stateRoot "processes.json"

# This is NOT the Windows Server installer. An explicit local workstation
# guard prevents accidentally switching the production host to a test profile.
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
if ([int]$os.ProductType -ne 1) {
    throw "Esta rotina e exclusiva para Windows cliente local. No servidor industrial, utilize o instalador e o procedimento de homologacao da fabrica."
}

if (!(Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw "Git nao encontrado. A atualizacao automatica da main nao pode prosseguir."
}
if (!(Test-Path (Join-Path $repoRoot ".git"))) {
    throw "Execute a rotina na copia Git do ANDON no ambiente local, nao em uma pasta de instalacao sem repositorio."
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
    Write-Host "Codigo main atualizado: $commit" -ForegroundColor Cyan

    # Option 2 applies code only. Stop a tracked local HTTPS test process if
    # it is still present so option 4 can start the new commit cleanly.
    if (Test-Path $stateFile -PathType Leaf) {
        & $stopScript
    }

    # The installer menu runs from a DIFFERENT directory than the Git clone.
    # Synchronize it as part of option 2, otherwise an old menu keeps showing
    # option 15 and uses outdated scripts even though 'git pull' succeeds.
    $installerPath = "C:\web-andon-industrial\installer"
    if (!(Test-Path $installerPath -PathType Container)) {
        throw "Instalador local nao encontrado em $installerPath. Codigo atualizado, mas nenhum menu foi substituido."
    }
    $names = @(
        "menu-andon-installer.ps1",
        "AndonInstaller.Runtime.ps1",
        "start-andon.ps1",
        "stop-andon.ps1",
        "health-check-andon.ps1",
        "AndonInstaller.LocalHttps.ps1"
    )
    $backupRoot = Join-Path $stateRoot ("installer-menu-backup-" + [guid]::NewGuid().ToString("N"))
    $stageRoot = Join-Path $backupRoot "staging"
    $savedRoot = Join-Path $backupRoot "original"
    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $savedRoot -Force | Out-Null

    # Prepare all sources before updating the first installed file.
    foreach ($name in $names) {
        $source = Join-Path $repoRoot ("installer\" + $name)
        $destination = Join-Path $installerPath $name
        if (!(Test-Path $source -PathType Leaf)) { throw "Script da main ausente: $name" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $stageRoot $name) -Force
        if (Test-Path $destination -PathType Leaf) {
            Copy-Item -LiteralPath $destination -Destination (Join-Path $savedRoot $name) -Force
        }
    }
    $updated = @()
    try {
        foreach ($name in $names) {
            $destination = Join-Path $installerPath $name
            Copy-Item -LiteralPath (Join-Path $stageRoot $name) -Destination $destination -Force
            $updated += $name
        }
    } catch {
        foreach ($name in $updated) {
            $saved = Join-Path $savedRoot $name
            $destination = Join-Path $installerPath $name
            if (Test-Path $saved -PathType Leaf) {
                Copy-Item -LiteralPath $saved -Destination $destination -Force
            } else {
                Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
            }
        }
        throw "Falha ao sincronizar menu. Cópias anteriores preservadas em $savedRoot. Erro: $($_.Exception.Message)"
    }
    foreach ($name in $names) {
        $sourceHash = (Get-FileHash (Join-Path $repoRoot ("installer\" + $name)) -Algorithm SHA256).Hash
        $installedHash = (Get-FileHash (Join-Path $installerPath $name) -Algorithm SHA256).Hash
        if ($sourceHash -ne $installedHash) {
            throw "Falha na verificacao do menu instalado: $name. Backups mantidos em $savedRoot"
        }
    }

    Write-Host ""
    Write-Host "Menu e comandos sincronizados com main ($commit)." -ForegroundColor Green
    Write-Host "Encerre o menu antigo e abra-o novamente. Os arquivos foram sincronizados, mas o frontend e a API NAO foram recompilados." -ForegroundColor Yellow
    Write-Host "Com backup verificado e autorizacao para migrations, no menu NOVO use 2 - Atualizar pela main (pipeline completo). A opcao 4 apenas inicia o build existente." -ForegroundColor Yellow
    Write-Host "HTTPS local: https://localhost:8080/hub | API: https://localhost:3001" -ForegroundColor Green
    Write-Host "Banco e certificados de testes preservados. Nenhuma mudanca na Evergreen." -ForegroundColor Yellow
} finally {
    Pop-Location
}
