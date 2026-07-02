$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"

Write-Host "===== ANDON - DESINSTALAR APP PRESERVANDO BANCO ====="

if (Test-Path "$ToolsPath\01-parar-servicos-andon.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\01-parar-servicos-andon.ps1"
}

Write-Host "Removendo tarefas ANDON..."
schtasks /Delete /TN "ANDON - Inicializacao Automatica" /F 2>$null
schtasks /Delete /TN "ANDON - Boot Servicos" /F 2>$null
schtasks /Delete /TN "ANDON - Watchdog Servicos" /F 2>$null
schtasks /Delete /TN "ANDON - Chrome Kiosk" /F 2>$null

Write-Host "Removendo regras de firewall do ANDON..."
Get-NetFirewallRule -DisplayName "ANDON Frontend 8080" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "ANDON API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

if (Test-Path $ProjectPath) {
    Write-Host "Removendo pasta do projeto: $ProjectPath"
    Remove-Item -Recurse -Force $ProjectPath
}

Write-Host "Banco PostgreSQL preservado."
Write-Host "===== DESINSTALACAO DO APP CONCLUIDA ====="
