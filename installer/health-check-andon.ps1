. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.NetworkDiagnostics.ps1"

try {
    Assert-AndonAdmin
    Invoke-AndonHealthCheck -Full
    try {
        # Observability only; never changes firewall, TLS trust or credentials.
        Show-AndonHttpsNetworkDiagnostics -Config (Import-AndonConfig)
    } catch {
        Write-AndonWarn "Diagnostico de rede indisponivel; health da API permanece independente."
    }
    exit 0
} catch {
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
