$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"
$PgBin = "C:\Program Files\PostgreSQL\18\bin"
$Psql = "$PgBin\psql.exe"

Write-Host "===== ANDON - DESINSTALACAO LIMPA PARA REINSTALACAO ====="

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

Write-Host ""
Write-Host "===== RESET DO BANCO POSTGRESQL ====="

if (Test-Path $Psql) {
    Write-Host "Tentando remover banco andon_db e usuario andon."
    & $Psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'andon_db';"
    & $Psql -h localhost -p 5432 -U postgres -d postgres -c "DROP DATABASE IF EXISTS andon_db;"
    & $Psql -h localhost -p 5432 -U postgres -d postgres -c "DROP USER IF EXISTS andon;"
} else {
    Write-Host "psql.exe nao encontrado em $Psql"
}

Write-Host "===== DESINSTALACAO LIMPA FINALIZADA ====="
