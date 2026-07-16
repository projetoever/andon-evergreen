. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"

try {
    Assert-AndonAdmin
    $config = Import-AndonConfig
    Write-AndonHeader "DESINSTALACAO LIMPA"
    if (!(Confirm-AndonTyped -Message "Esta operacao remove app, tarefas, firewall e pode remover banco conforme o modo configurado." -Expected "APAGAR")) { Write-AndonWarn "Operacao cancelada."; exit 0 }
    Stop-AndonRuntime
    Remove-AndonTasks
    Remove-AndonFirewallRules
    if (Test-Path $Global:AndonProjectPath) { Remove-Item $Global:AndonProjectPath -Recurse -Force -ErrorAction SilentlyContinue; Write-AndonOk "Projeto removido: $Global:AndonProjectPath" }
    if (Test-Path $Global:AndonToolsPath) { Remove-Item $Global:AndonToolsPath -Recurse -Force -ErrorAction SilentlyContinue; Write-AndonOk "Tools removidas: $Global:AndonToolsPath" }
    if ($config.databaseMode -eq "docker") { Remove-AndonDockerDatabaseClean } elseif ($config.databaseMode -eq "local") { Remove-AndonLocalDatabaseClean } else { Write-AndonWarn "databaseMode desconhecido: $($config.databaseMode). Banco nao removido." }
    if (Confirm-AndonTyped -Message "Para remover tambem andon-config.json, digite APAGAR_CONFIG." -Expected "APAGAR_CONFIG") { Remove-Item $Global:AndonConfigPath -Force -ErrorAction SilentlyContinue; Remove-Item $Global:AndonNetworkConfigPath -Force -ErrorAction SilentlyContinue; Write-AndonOk "Configs removidas." } else { Write-AndonWarn "Configs preservadas." }
    Write-AndonOk "Desinstalacao limpa finalizada."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
