. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

function Invoke-AndonMenuScript {
    param([string]$ScriptPath, [string]$Description)
    Write-AndonHeader $Description
    if (!(Test-AndonAdmin)) { Write-AndonFail "Execute este menu como Administrador."; Read-Host "Pressione ENTER para voltar"; return }
    if (!(Test-Path $ScriptPath)) { Write-AndonFail "Script nao encontrado: $ScriptPath"; Read-Host "Pressione ENTER para voltar"; return }
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File $ScriptPath
    Write-Host ""
    Write-Host "Codigo de saida: $LASTEXITCODE"
    Read-Host "Pressione ENTER para voltar ao menu"
}

function Show-AndonMenu {
    do {
        Clear-Host
        Write-AndonHeader "ANDON WEB INDUSTRIAL - INSTALADOR V10.5.1"
        Show-AndonStatus
        Write-AndonHeader "MENU PRINCIPAL"
        Write-Host "1  - Instalacao limpa com escolha Docker/local"
        Write-Host "2  - Atualizar pela main preservando modo do banco"
        Write-Host "3  - Reparar instalacao preservando modo do banco"
        Write-Host "4  - Iniciar ANDON"
        Write-Host "5  - Parar ANDON"
        Write-Host "6  - Verificar saude"
        Write-Host "7  - Recriar tarefas automaticas"
        Write-Host "8  - Desativar inicializacao automatica"
        Write-Host "9  - Habilitar inicializacao automatica"
        Write-Host "10 - Desinstalar preservando banco"
        Write-Host "11 - Desinstalacao limpa"
        Write-Host "12 - Configurar IP/rede do servidor"
        Write-Host "13 - Configurar PostgreSQL/porta do banco"
        Write-Host "0  - Sair"
        Write-Host ""
        $option = Read-Host "Escolha uma opcao"
        switch ($option) {
            "1" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\install-andon-server.ps1" "Instalacao limpa" }
            "2" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\update-andon-server.ps1" "Atualizar pela main" }
            "3" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\repair-andon-server.ps1" "Reparar instalacao" }
            "4" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\start-andon.ps1" "Iniciar ANDON" }
            "5" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\stop-andon.ps1" "Parar ANDON" }
            "6" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\health-check-andon.ps1" "Verificar saude" }
            "7" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\recreate-andon-tasks.ps1" "Recriar tarefas automaticas" }
            "8" { foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) { Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }; Write-AndonOk "Inicializacao automatica desativada."; Read-Host "Pressione ENTER para voltar" }
            "9" { foreach ($taskName in @($Global:AndonTaskBoot, $Global:AndonTaskWatchdog, $Global:AndonTaskKiosk)) { Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }; Write-AndonOk "Inicializacao automatica habilitada."; Read-Host "Pressione ENTER para voltar" }
            "10" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\uninstall-andon-preserve-db.ps1" "Desinstalar preservando banco" }
            "11" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\uninstall-andon-clean.ps1" "Desinstalacao limpa" }
            "12" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\configure-andon-network.ps1" "Configurar IP/rede" }
            "13" { Invoke-AndonMenuScript "$Global:AndonInstallerPath\configure-andon-postgres.ps1" "Configurar PostgreSQL/porta" }
            "0" { return }
            default { Write-AndonFail "Opcao invalida."; Read-Host "Pressione ENTER para voltar" }
        }
    } while ($true)
}

try { Assert-AndonAdmin; Initialize-AndonFolders; Show-AndonMenu } catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; Read-Host "Pressione ENTER para sair"; exit 1 }
