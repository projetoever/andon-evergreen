$ErrorActionPreference = "Stop"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$InstallerPath = "$BasePath\installer"
$ToolsPath = "$BasePath\andon-tools"
$RepoUrl = "https://github.com/projetoever/andon-evergreen.git"
$Branch = "main"

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Header {
    param([string]$Message)

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " $Message" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FALHA] $Message" -ForegroundColor Red
}

Write-Header "ANDON WEB INDUSTRIAL - BOOTSTRAP DO INSTALADOR"

if (!(Test-IsAdmin)) {
    Write-Fail "Execute este script como Administrador."
    Write-Host ""
    Read-Host "Pressione ENTER para sair"
    exit 1
}

$git = Get-Command git -ErrorAction SilentlyContinue

if (!$git) {
    Write-Fail "Git nao encontrado."
    Write-Host "Instale o Git antes de continuar."
    Write-Host "Depois execute este bootstrap novamente."
    Write-Host ""
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Ok "PowerShell em modo Administrador"
Write-Ok "Git encontrado: $($git.Source)"

Write-Header "1. Preparando pastas oficiais"

New-Item -ItemType Directory -Force $BasePath | Out-Null
New-Item -ItemType Directory -Force $InstallerPath | Out-Null
New-Item -ItemType Directory -Force $ToolsPath | Out-Null

Write-Ok "Base:       $BasePath"
Write-Ok "Instalador: $InstallerPath"
Write-Ok "Tools:      $ToolsPath"

Write-Header "2. Obtendo projeto ANDON"

if (Test-Path "$ProjectPath\.git") {
    Write-Host "Repositorio existente encontrado."
    Write-Host "Atualizando pela branch $Branch..."

    Set-Location $ProjectPath

    git fetch --all --prune
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "git fetch falhou."
        exit 1
    }

    git checkout $Branch
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "git checkout $Branch falhou."
        exit 1
    }

    git pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "git pull falhou. Verifique alteracoes locais com git status."
        exit 1
    }

    Write-Ok "Repositorio atualizado."
} elseif (Test-Path $ProjectPath) {
    Write-Fail "A pasta do projeto existe, mas nao e um repositorio Git valido:"
    Write-Host $ProjectPath
    Write-Host ""
    Write-Host "Para evitar perda de dados, o bootstrap nao remove essa pasta automaticamente."
    Write-Host "Renomeie/remova manualmente ou use o menu de desinstalacao limpa."
    exit 1
} else {
    Write-Host "Clonando projeto..."
    Set-Location $BasePath

    git clone --branch $Branch $RepoUrl $ProjectPath

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "git clone falhou."
        exit 1
    }

    Write-Ok "Projeto clonado em: $ProjectPath"
}

Write-Header "3. Copiando instalador e ferramentas"

if (!(Test-Path "$ProjectPath\installer")) {
    Write-Fail "Pasta installer nao encontrada no projeto."
    exit 1
}

Copy-Item "$ProjectPath\installer\*.ps1" $InstallerPath -Force
Write-Ok "Instalador copiado para: $InstallerPath"

if (Test-Path "$ProjectPath\install-tools") {
    Copy-Item "$ProjectPath\install-tools\*.ps1" $ToolsPath -Force
    Write-Ok "Ferramentas copiadas para: $ToolsPath"
} else {
    Write-Warn "Pasta install-tools nao encontrada. Tools nao foram copiadas."
}

Write-Header "4. Bootstrap concluido"

Write-Host "Menu do instalador:"
Write-Host "$InstallerPath\menu-andon-installer.ps1"
Write-Host ""
Write-Host "Para primeira instalacao, use no menu:"
Write-Host "1 - Instalacao limpa" -ForegroundColor Yellow
Write-Host ""
Write-Host "Durante a instalacao, o sistema perguntara a porta do PostgreSQL."
Write-Host "Padrao: 5432"
Write-Host "Alternativa: 5433, se 5432 estiver ocupada por outro PostgreSQL."
Write-Host ""

$openMenu = Read-Host "Abrir menu do instalador agora? [S/n]"

if ($openMenu -ne "n" -and $openMenu -ne "N") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$InstallerPath\menu-andon-installer.ps1"
}

exit 0
