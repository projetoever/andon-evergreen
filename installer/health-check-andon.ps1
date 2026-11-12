. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.NetworkDiagnostics.ps1"

$probeTimer = [System.Diagnostics.Stopwatch]::StartNew()
$healthFailure = ""
try {
    Assert-AndonAdmin
    try {
        # Diagnostic mode never starts processes, changes TLS/firewall, or
        # creates/cancels temporary tickets. Menu 4 handles recovery.
        Invoke-AndonHealthCheck -Full -ReadOnly
    } catch {
        $healthFailure = "$($_.Exception.Message)"
    }

    # Network evidence is essential even if the API/frontend health failed.
    # Never turn an optional inspection failure into a false DB health error.
    try {
        Show-AndonHttpsNetworkDiagnostics -Config (Import-AndonConfig)
    } catch {
        Write-AndonWarn "Diagnostico de rede parcialmente indisponivel. Verifique permissoes de leitura das interfaces/regras."
    }

    $probeTimer.Stop()
    Write-AndonHeader "RESUMO DO DIAGNOSTICO"
    if ($healthFailure) {
        Write-AndonFail "ATENCAO: ha falha operacional real ou de controle de acesso."
        Write-AndonWarn "Revise os itens [FAIL] acima; nao repare nem reinstale sem diagnostico."
        Write-Host ("Tempo de verificacao: {0} ms" -f $probeTimer.ElapsedMilliseconds)
        exit 1
    }
    Write-AndonOk "API, banco, frontend e limites de autenticacao: verificacoes locais aprovadas."
    Write-AndonWarn "Acesso externo pelo celular NAO esta comprovado pelo health local; teste de outro dispositivo e obrigatorio."
    Write-Host ("Tempo de verificacao: {0} ms" -f $probeTimer.ElapsedMilliseconds)
    exit 0
} catch {
    $probeTimer.Stop()
    Write-AndonHeader "ERRO"
    Write-AndonFail "Nao foi possivel concluir as verificacoes locais. Confira permissoes e instalacao."
    exit 1
}
