# REFINE13: explicit, repeatable activation of central Hub after a proven
# isolated database backup. This never creates Admin accounts or touches data.
function Test-AndonPrimaryCentralAdmin {
    param([Parameter(Mandatory=$true)][object]$Config)
    if ("$($Config.databaseMode)" -ne "docker" -or
        "$($Config.postgresHost)".Trim().ToLowerInvariant() -notin @("127.0.0.1", "localhost")) {
        throw "Ativacao guiada suporta somente PostgreSQL Docker local. Nada foi habilitado."
    }
    $db = "$($Config.databaseName)".Trim()
    $user = "$($Config.databaseUser)".Trim()
    $container = "$($Config.dockerContainer)".Trim()
    if ($db -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' -or
        $user -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$' -or
        $container -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
        throw "Identificacao do banco original invalida. Nada foi habilitado."
    }
    if ([int](Get-AndonMappedDockerPort $container) -ne [int]$Config.postgresPort) {
        throw "Porta do banco Docker nao confere com configuracao. Nada foi habilitado."
    }
    $docker = Get-AndonCommandPath "docker.exe" "Docker obrigatorio para checagem do Admin central."
    $sql = @'
SELECT COUNT(*) FROM access_users
WHERE "isPrimaryAdmin" IS TRUE AND active IS TRUE
  AND "mustChangePassword" IS FALSE
  AND length("passwordHash") >= 20;
'@
    $result = @($sql | & $docker exec -i $container psql -X -q -A -t -v ON_ERROR_STOP=1 -U $user -d $db 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel consultar Admin central no banco original: ativacao bloqueada."
    }
    $count = ($result -join "").Trim()
    if ($count -ne "1") {
        throw "E obrigatorio exatamente um Admin central ativo com senha pessoal pronta. Encontrados: $count. Nao ativado."
    }
    return $true
}

function Request-AndonCentralNotebookActivation {
    param([Parameter(Mandatory=$true)][object]$Config)
    if ("$($Config.centralAccessEnabled)".Trim().ToLowerInvariant() -eq "true") {
        Write-AndonOk "Login central ja habilitado; atualizacao preservara o perfil atual."
        return $false
    }
    Write-AndonHeader "REFINE 13 - ATIVACAO CENTRAL SEGURA"
    Write-AndonWarn "O codigo novo foi instalado mas o acesso central antigo esta OFF."
    Write-Host "Banco: $($Config.databaseName) | Modo: $($Config.databaseMode) | Porta: $($Config.postgresPort)"
    Write-Host "Uma alteracao de autenticacao pode impedir acesso com a senha legada."
    Write-Host "Esta etapa nao cria usuarios, nao troca senhas e nao modifica dados de producao."
    if ("$($Config.transportMode)" -ne "https") {
        Write-AndonWarn "HTTPS nao configurado. Acesso central nao sera ativado."
        return $false
    }
    if ("$($Config.postgresHost)".Trim().ToLowerInvariant() -notin @("127.0.0.1", "localhost")) {
        Write-AndonWarn "Banco remoto: nao habilitar perfil de notebook."
        return $false
    }
    Write-Host "Para ativar login central e recursos R12/R13 para TESTE no notebook isolado,"
    Write-Host "digite NOTEBOOK_ISOLADO; qualquer outra entrada preserva o modo legado."
    $choice = Read-Host "Ativar perfil de homologacao"
    if ($choice -cne "NOTEBOOK_ISOLADO") {
        Write-AndonWarn "Acesso central permanece desligado."
        return $false
    }
    Test-AndonPrimaryCentralAdmin -Config $Config | Out-Null
    Write-AndonOk "Admin central ativo e preparado encontrado no banco original."
    Write-AndonWarn "A senha pessoal central deve ser conhecida e testada. A senha legada nao entra neste modo."
    $approval = Read-Host "Confirme digitando ATIVAR_CENTRAL"
    if ($approval -cne "ATIVAR_CENTRAL") {
        Write-AndonWarn "Ativacao cancelada: modo legado preservado."
        return $false
    }
    return $true
}

function Set-AndonCentralNotebookActivation {
    param([Parameter(Mandatory=$true)][object]$Config)
    if ("$($Config.centralAccessEnabled)".Trim().ToLowerInvariant() -eq "true") {
        return $false
    }
    $oldCentral = $Config.centralAccessEnabled
    $oldValidation = $Config.centralSecurityValidationEnabled
    $Config = Set-AndonConfigProperty -Config $Config -Name "centralAccessEnabled" -Value $true
    $Config = Set-AndonConfigProperty -Config $Config -Name "centralSecurityValidationEnabled" -Value $true
    try {
        Save-AndonConfig $Config
        Write-AndonBackendEnv -Config $Config
        Write-AndonOk "Perfil notebook central R12/R13 habilitado e persistido."
        return $true
    } catch {
        $Config = Set-AndonConfigProperty -Config $Config -Name "centralAccessEnabled" -Value $oldCentral
        $Config = Set-AndonConfigProperty -Config $Config -Name "centralSecurityValidationEnabled" -Value $oldValidation
        try { Save-AndonConfig $Config; Write-AndonBackendEnv -Config $Config }
        catch { Write-AndonWarn "Restauracao de configuracao falhou: rever backups antes de reiniciar." }
        throw
    }
}
