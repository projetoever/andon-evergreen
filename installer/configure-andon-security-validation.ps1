# REFINE 13 - opt-in for controlled security validation on a disconnected notebook.
. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"
try {
    Assert-AndonAdmin
    if (!(Test-Path $Global:AndonConfigPath -PathType Leaf)) {
        throw "Instale ou atualize o ANDON antes de configurar o perfil de homologacao."
    }
    $config = Import-AndonConfig
    $previous = (
        $null -ne $config.centralSecurityValidationEnabled -and
        "$($config.centralSecurityValidationEnabled)".Trim().ToLowerInvariant() -eq "true"
    )
    Write-AndonHeader "RECURSOS CENTRAIS DE SEGURANCA - HOMOLOGACAO"
    Write-Host "Este perfil habilita APIs centrais de cadastro e atendimento para TESTES no notebook."
    Write-Host "Nao habilita Node-RED, GPIO, CLPs nem acesso remoto/mobile automaticamente."
    Write-Host "Exige HTTPS, login central e banco local. Nao aplicar diretamente na fabrica."
    Write-Host "1 - Ativar perfil de homologacao no notebook"
    Write-Host "2 - Desativar e retornar ao padrao seguro"
    Write-Host "0 - Cancelar"
    $choice = (Read-Host "Escolha").Trim()
    if ($choice -eq "0") { exit 0 }
    if ($choice -notin @("1", "2")) { throw "Escolha invalida." }
    $enabled = $choice -eq "1"
    if ($enabled) {
        if ("$($config.centralAccessEnabled)".Trim().ToLowerInvariant() -ne "true" -or
            "$($config.transportMode)".Trim().ToLowerInvariant() -ne "https" -or
            "$($config.postgresHost)".Trim().ToLowerInvariant() -notin @("127.0.0.1", "localhost")) {
            throw "Perfil so pode ser ativado com acesso central, HTTPS e PostgreSQL local."
        }
        $approval = Read-Host "Confirma que este e um notebook isolado? Digite NOTEBOOK_ISOLADO"
        if ($approval -cne "NOTEBOOK_ISOLADO") { throw "Ativacao nao confirmada." }
    }
    Stop-AndonRuntime
    $config.centralSecurityValidationEnabled = $enabled
    try {
        Save-AndonConfig $config
        Write-AndonBackendEnv -Config $config
    } catch {
        $config.centralSecurityValidationEnabled = $previous
        Save-AndonConfig $config
        Write-AndonBackendEnv -Config $config
        throw
    }
    Write-AndonOk "Perfil de homologacao $(if ($enabled) { 'ATIVADO' } else { 'DESATIVADO' })."
    Write-AndonWarn "Utilize a opcao 4 para iniciar e a opcao 6 para verificar saude."
    exit 0
} catch {
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
