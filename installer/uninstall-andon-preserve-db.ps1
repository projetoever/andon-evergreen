. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

try {
    Assert-AndonAdmin
    $config = Import-AndonConfig
    Write-AndonHeader "DESINSTALAR PRESERVANDO BANCO"
    if (!(Confirm-AndonTyped -Message "Esta operacao remove app, tarefas, firewall e cache, mas preserva banco/volume." -Expected "APAGAR")) { Write-AndonWarn "Operacao cancelada."; exit 0 }
    Stop-AndonRuntime
    Remove-AndonTasks
    Remove-AndonFirewallRules
    if (Test-Path $Global:AndonProjectPath) { Remove-Item $Global:AndonProjectPath -Recurse -Force -ErrorAction SilentlyContinue; Write-AndonOk "Projeto removido: $Global:AndonProjectPath" }
    if (Test-Path $Global:AndonToolsPath) { Remove-Item $Global:AndonToolsPath -Recurse -Force -ErrorAction SilentlyContinue; Write-AndonOk "Tools removidas: $Global:AndonToolsPath" }
    Write-AndonWarn "Banco preservado."
    if ($config.databaseMode -eq "docker") { Write-AndonWarn "Container/volume Docker preservados: $Global:AndonDockerContainer / $Global:AndonDockerVolume" } else { Write-AndonWarn "PostgreSQL local e banco $Global:AndonDatabaseName preservados." }
    Write-AndonOk "Desinstalacao preservando banco finalizada."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
