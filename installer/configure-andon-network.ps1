. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"

try {
    Assert-AndonAdmin
    $config = Import-AndonConfig
    $network = Select-AndonServerIp
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    Write-AndonOk "Rede atualizada. Execute reparar ou iniciar ANDON se necessario."
    exit 0
} catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
