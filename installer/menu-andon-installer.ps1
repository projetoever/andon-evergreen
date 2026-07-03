$ErrorActionPreference = "Continue"

$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"
$InstallerPath = "$BasePath\installer"
$LogsPath = "$ProjectPath\logs"

$InstallScript = "$InstallerPath\install-andon-server.ps1"
$UpdateScript = "$InstallerPath\update-andon-server.ps1"
$RepairScript = "$InstallerPath\repair-andon-server.ps1"
$UninstallPreserveDbScript = "$InstallerPath\uninstall-andon-preserve-db.ps1"
$UninstallCleanScript = "$InstallerPath\uninstall-andon-clean.ps1"

$StartScript = "$ToolsPath\04-iniciar-servicos-andon.ps1"
$StopScript = "$ToolsPath\01-parar-servicos-andon.ps1"
$HealthScript = "$ToolsPath\05-verificar-saude-andon.ps1"
$DisableStartupScript = "$ToolsPath\07-desativar-inicializacao-automatica-andon.ps1"
$EnableStartupScript = "$ToolsPath\08-habilitar-inicializacao-automatica-andon.ps1"
$RecreateTasksScript = "$ToolsPath\09-recriar-tarefas-automaticas-andon.ps1"

function Ensure-BaseFolders {
    New-Item -ItemType Directory -Force $BasePath | Out-Null
    New-Item -ItemType Directory -Force $InstallerPath | Out-Null

    if (Test-Path $ProjectPath) {
        New-Item -ItemType Directory -Force $LogsPath | Out-Null
    }
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Header {
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "       ANDON WEB INDUSTRIAL - INSTALADOR" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Base oficial:        $BasePath"
    Write-Host "Projeto/app:         $ProjectPath"
    Write-Host "Ferramentas:         $ToolsPath"
    Write-Host "Instalador:          $InstallerPath"
    Write-Host ""
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "---- $Message ----" -ForegroundColor Yellow
}

function Pause-Menu {
    Write-Host ""
    Read-Host "Pressione ENTER para voltar ao menu"
}

function Invoke-AndonScript {
    param(
        [string]$ScriptPath,
        [string]$Description,
        [switch]$RequireConfirmation,
        [string]$ConfirmationText = ""
    )

    Write-Section $Description

    if (!(Test-IsAdmin)) {
        Write-Host "ERRO: execute este menu como Administrador." -ForegroundColor Red
        Pause-Menu
        return
    }

    if (!(Test-Path $ScriptPath)) {
        Write-Host "ERRO: script nao encontrado:" -ForegroundColor Red
        Write-Host $ScriptPath
        Pause-Menu
        return
    }

    if ($RequireConfirmation) {
        Write-Host ""
        Write-Host "ATENCAO: esta operacao exige confirmacao." -ForegroundColor Red
        Write-Host $ConfirmationText -ForegroundColor Yellow
        Write-Host ""
        $confirm = Read-Host "Digite APAGAR para continuar"

        if ($confirm -ne "APAGAR") {
            Write-Host "Operacao cancelada pelo usuario." -ForegroundColor Yellow
            Pause-Menu
            return
        }
    }

    Write-Host "Executando:" -ForegroundColor Cyan
    Write-Host $ScriptPath
    Write-Host ""

    powershell.exe -ExecutionPolicy Bypass -NoProfile -File $ScriptPath

    Write-Host ""
    Write-Host "Codigo de saida: $LASTEXITCODE"
    Pause-Menu
}

function Show-EnvironmentStatus {
    Write-Section "Status rapido do ambiente"

    if (Test-IsAdmin) {
        Write-Host "[OK] PowerShell como Administrador" -ForegroundColor Green
    } else {
        Write-Host "[FALHA] PowerShell nao esta como Administrador" -ForegroundColor Red
    }

    if (Test-Path $ProjectPath) {
        Write-Host "[OK] Projeto encontrado: $ProjectPath" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] Projeto ainda nao encontrado: $ProjectPath" -ForegroundColor Yellow
    }

    if (Test-Path $ToolsPath) {
        Write-Host "[OK] Ferramentas encontradas: $ToolsPath" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] Ferramentas ainda nao encontradas: $ToolsPath" -ForegroundColor Yellow
    }

    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        Write-Host "[OK] Git: $($git.Source)" -ForegroundColor Green
    } else {
        Write-Host "[FALHA] Git nao encontrado" -ForegroundColor Red
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        Write-Host "[OK] Node.js: $($node.Source)" -ForegroundColor Green
    } else {
        Write-Host "[FALHA] Node.js nao encontrado" -ForegroundColor Red
    }

    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) {
        Write-Host "[OK] npm.cmd: $($npmCmd.Source)" -ForegroundColor Green
    } else {
        Write-Host "[FALHA] npm.cmd nao encontrado" -ForegroundColor Red
    }

    $psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
    if (Test-Path $psqlPath) {
        Write-Host "[OK] psql.exe: $psqlPath" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] psql.exe nao encontrado em: $psqlPath" -ForegroundColor Yellow
    }

    $chromeCandidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )

    $chromeFound = $false
    foreach ($candidate in $chromeCandidates) {
        if (Test-Path $candidate) {
            Write-Host "[OK] Chrome: $candidate" -ForegroundColor Green
            $chromeFound = $true
            break
        }
    }

    if (-not $chromeFound) {
        $chromeCmd = Get-Command chrome.exe -ErrorAction SilentlyContinue
        if ($chromeCmd) {
            Write-Host "[OK] Chrome: $($chromeCmd.Source)" -ForegroundColor Green
        } else {
            Write-Host "[AVISO] Chrome nao encontrado. Kiosk pode nao funcionar." -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "Portas oficiais:"
    foreach ($port in @(3001, 8080, 5432)) {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            Write-Host "[USO] Porta $port em uso" -ForegroundColor Yellow
        } else {
            Write-Host "[LIVRE] Porta $port livre" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "Tarefas ANDON:"
    schtasks /Query | findstr ANDON
}

function Show-Menu {
    Write-Header

    Show-EnvironmentStatus

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host " MENU PRINCIPAL" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1  - Instalacao limpa"
    Write-Host "2  - Atualizar pela main"
    Write-Host "3  - Reparar instalacao"
    Write-Host "4  - Iniciar ANDON"
    Write-Host "5  - Parar ANDON"
    Write-Host "6  - Verificar saude"
    Write-Host "7  - Recriar tarefas automaticas"
    Write-Host "8  - Desativar inicializacao automatica"
    Write-Host "9  - Habilitar inicializacao automatica"
    Write-Host "10 - Desinstalar preservando banco"
    Write-Host "11 - Desinstalacao limpa"
    Write-Host "0  - Sair"
    Write-Host ""
}

Ensure-BaseFolders

do {
    Show-Menu
    $option = Read-Host "Escolha uma opcao"

    switch ($option) {
        "1" {
            Invoke-AndonScript `
                -ScriptPath $InstallScript `
                -Description "Instalacao limpa do ANDON Server" `
                -RequireConfirmation `
                -ConfirmationText "A instalacao limpa pode recriar banco e rodar seed inicial. Use apenas em ambiente novo ou apos backup confirmado."
        }

        "2" {
            Invoke-AndonScript `
                -ScriptPath $UpdateScript `
                -Description "Atualizacao segura pela branch main"
        }

        "3" {
            Invoke-AndonScript `
                -ScriptPath $RepairScript `
                -Description "Reparacao da instalacao"
        }

        "4" {
            Invoke-AndonScript `
                -ScriptPath $StartScript `
                -Description "Iniciar ANDON"
        }

        "5" {
            Invoke-AndonScript `
                -ScriptPath $StopScript `
                -Description "Parar ANDON"
        }

        "6" {
            Invoke-AndonScript `
                -ScriptPath $HealthScript `
                -Description "Verificar saude do ANDON"
        }

        "7" {
            Invoke-AndonScript `
                -ScriptPath $RecreateTasksScript `
                -Description "Recriar tarefas automaticas"
        }

        "8" {
            Invoke-AndonScript `
                -ScriptPath $DisableStartupScript `
                -Description "Desativar inicializacao automatica"
        }

        "9" {
            Invoke-AndonScript `
                -ScriptPath $EnableStartupScript `
                -Description "Habilitar inicializacao automatica"
        }

        "10" {
            Invoke-AndonScript `
                -ScriptPath $UninstallPreserveDbScript `
                -Description "Desinstalacao preservando banco" `
                -RequireConfirmation `
                -ConfirmationText "Esta operacao remove o app, mas preserva PostgreSQL e andon_db."
        }

        "11" {
            Invoke-AndonScript `
                -ScriptPath $UninstallCleanScript `
                -Description "Desinstalacao limpa" `
                -RequireConfirmation `
                -ConfirmationText "Esta operacao remove app, tarefas, firewall, banco andon_db e usuario andon. PostgreSQL nao sera removido."
        }

        "0" {
            Write-Host "Saindo do instalador ANDON." -ForegroundColor Cyan
        }

        default {
            Write-Host "Opcao invalida." -ForegroundColor Yellow
            Pause-Menu
        }
    }
} while ($option -ne "0")
