# REFINE 22 - explicit, reversible catalog vs operational call-opening HML.
# Applies only to a secured isolated notebook; never auto-enables PLC/Node-RED/BI.
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
    $previousOpening = (
        $null -ne $config.hierarchicalCallPilotEnabled -and
        "$($config.hierarchicalCallPilotEnabled)".Trim().ToLowerInvariant() -eq "true"
    )
    Write-AndonHeader "RECURSOS CENTRAIS - HOMOLOGACAO NO NOTEBOOK"
    Write-Host "Catalogo de motivos/subcategorias e abertura operacional sao liberacoes SEPARADAS."
    Write-Host "Exige HTTPS, login central e PostgreSQL local. Nao aplicar na fabrica."
    Write-Host "Nao habilita Node-RED, GPIO, CLPs nem BI corretivo automaticamente."
    Write-Host "1 - Ativar catalogo de motivos e demais recursos centrais no notebook"
    Write-Host "2 - Desativar perfil de homologacao e abertura hierarquica"
    Write-Host "3 - Ativar abertura hierarquica para testes operacionais CONTROLADOS"
    Write-Host "4 - Desativar somente abertura hierarquica (manter catalogo)"
    Write-Host "0 - Cancelar"
    $choice = (Read-Host "Escolha").Trim()
    if ($choice -eq "0") { exit 0 }
    if ($choice -notin @("1", "2", "3", "4")) { throw "Escolha invalida." }

    $enabled = if ($choice -eq "1" -or $choice -eq "3") { $true }
        elseif ($choice -eq "2") { $false } else { $previous }
    $opening = $choice -eq "3"
    if ($choice -eq "3" -and !$previous) {
        throw "Ative e teste o catalogo pelo modo 1 antes de liberar abertura hierarquica."
    }
    if ($choice -eq "1" -or $choice -eq "3") {
        if ("$($config.centralAccessEnabled)".Trim().ToLowerInvariant() -ne "true" -or
            "$($config.transportMode)".Trim().ToLowerInvariant() -ne "https" -or
            "$($config.postgresHost)".Trim().ToLowerInvariant() -notin @("127.0.0.1", "localhost")) {
            throw "Perfil so pode ser ativado com acesso central, HTTPS e PostgreSQL local."
        }
        $approval = Read-Host "Confirma notebook isolado? Digite NOTEBOOK_ISOLADO"
        if ($approval -cne "NOTEBOOK_ISOLADO") { throw "Ativacao nao confirmada." }
    }
    if ($choice -eq "3") {
        Write-AndonWarn "A proxima abertura operacional com motivo podera gerar um chamado real."
        Write-AndonWarn "Somente teste em maquina isolada/ambiente autorizado, sem dados produtivos."
        $approval = Read-Host "Para habilitar abertura de TESTE digite TESTAR_HIERARQUIA"
        if ($approval -cne "TESTAR_HIERARQUIA") {
            throw "Abertura hierarquica nao autorizada."
        }
    }
    # No automatic restart: a running session/P0 test must not be silently changed.
    Stop-AndonRuntime
    $config.centralSecurityValidationEnabled = $enabled
    $config.hierarchicalCallPilotEnabled = $opening
    try {
        Save-AndonConfig $config
        Write-AndonBackendEnv -Config $config
    } catch {
        $config.centralSecurityValidationEnabled = $previous
        $config.hierarchicalCallPilotEnabled = $previousOpening
        Save-AndonConfig $config
        Write-AndonBackendEnv -Config $config
        throw
    }
    Write-AndonOk "Catalogo HML $(if ($enabled) { 'ATIVO' } else { 'DESATIVADO' })."
    Write-AndonOk "Abertura hierarquica HML $(if ($opening) { 'ATIVA PARA TESTE' } else { 'DESATIVADA' })."
    Write-AndonWarn "Use menu 4 para iniciar e menu 6 para verificar saude. Nao utilizar no servidor industrial."
    exit 0
} catch {
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
