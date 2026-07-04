$ErrorActionPreference = "Stop"

$CommonPath = Join-Path $PSScriptRoot "AndonInstaller.Common.ps1"

if (!(Test-Path $CommonPath)) {
    Write-Host "ERRO: biblioteca comum nao encontrada:" -ForegroundColor Red
    Write-Host $CommonPath
    exit 1
}

. $CommonPath

Write-AndonHeader "ANDON - DESINSTALAR PRESERVANDO BANCO"

Assert-AndonAdmin

Write-Host ""
Write-Host "Esta opcao remove a instalacao do ANDON, mas PRESERVA o banco PostgreSQL." -ForegroundColor Yellow
Write-Host ""
Write-Host "Sera removido/preservado:"
Write-Host "- Remove tarefas automaticas ANDON"
Write-Host "- Remove regras de firewall ANDON"
Write-Host "- Para servicos/processos do ANDON"
Write-Host "- Remove pasta do app: $Global:AndonProjectPath"
Write-Host "- PRESERVA banco: $Global:AndonDatabaseName"
Write-Host "- PRESERVA usuario DB: $Global:AndonDatabaseUser"
Write-Host "- PRESERVA configuracao global: $Global:AndonConfigPath"
Write-Host "- PRESERVA tools: $Global:AndonToolsPath"
Write-Host ""

$confirm = Read-Host "Digite PRESERVAR para continuar"

if ($confirm -ne "PRESERVAR") {
    Write-AndonWarn "Desinstalacao cancelada."
    exit 0
}

Write-AndonHeader "1. Parando servicos/processos"
Stop-AndonServicesSafe

Write-AndonHeader "2. Removendo tarefas automaticas"

foreach ($taskName in @(
    "ANDON - Inicializacao Automatica",
    $Global:AndonTaskBoot,
    $Global:AndonTaskWatchdog,
    $Global:AndonTaskKiosk
)) {
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null
    Write-Host "Tarefa removida/se inexistente: $taskName"
}

Write-AndonHeader "3. Removendo regras de firewall"

Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-AndonOk "Regras de firewall removidas/se inexistentes."

Write-AndonHeader "4. Removendo pasta do app"

if (Test-Path $Global:AndonProjectPath) {
    Remove-Item -Recurse -Force $Global:AndonProjectPath
    Write-AndonOk "Pasta removida: $Global:AndonProjectPath"
} else {
    Write-AndonWarn "Pasta do app nao encontrada: $Global:AndonProjectPath"
}

Write-AndonHeader "DESINSTALACAO PRESERVANDO BANCO FINALIZADA"

Write-Host "Banco preservado:" -ForegroundColor Green
Write-Host "$Global:AndonDatabaseName"
Write-Host ""
Write-Host "Configuracao preservada:" -ForegroundColor Green
Write-Host "$Global:AndonConfigPath"
Write-Host ""
Write-Host "Tools preservadas:" -ForegroundColor Green
Write-Host "$Global:AndonToolsPath"
Write-Host ""

exit 0
