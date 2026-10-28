$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $repositoryRoot "installer\AndonInstaller.Transport.ps1")

function Assert-TransportTest {
    param([bool]$Condition, [string]$Message)
    if (!$Condition) { throw "FALHA: $Message" }
}

function Set-TestState {
    param(
        [string]$ConfigValue,
        [string]$NetworkValue,
        [string]$EnvValue
    )
    Set-Content -LiteralPath $script:configPath -Value $ConfigValue -Encoding UTF8
    Set-Content -LiteralPath $script:networkPath -Value $NetworkValue -Encoding UTF8
    Set-Content -LiteralPath $script:envPath -Value $EnvValue -Encoding UTF8
}

function Assert-TestState {
    param(
        [string]$ConfigValue,
        [string]$NetworkValue,
        [string]$EnvValue
    )
    Assert-TransportTest `
        -Condition ((Get-Content $script:configPath -Raw).Trim() -eq $ConfigValue) `
        -Message "andon-config.json anterior deve ser restaurado"
    Assert-TransportTest `
        -Condition ((Get-Content $script:networkPath -Raw).Trim() -eq $NetworkValue) `
        -Message "configuracao de rede anterior deve ser restaurada"
    Assert-TransportTest `
        -Condition ((Get-Content $script:envPath -Raw).Trim() -eq $EnvValue) `
        -Message ".env anterior deve ser restaurado"
}

$testRoot = Join-Path $env:TEMP ("andon-https-transaction-" + [guid]::NewGuid().ToString("N"))
$tlsPath = Join-Path $testRoot "tls"
$sourcePath = Join-Path $testRoot "source"
$statePath = Join-Path $testRoot "state"
$script:configPath = Join-Path $statePath "andon-config.json"
$script:networkPath = Join-Path $statePath "andon-network.config.json"
$script:envPath = Join-Path $statePath "server.env"
$sourceCertificate = Join-Path $sourcePath "certificate.pem"
$sourcePrivateKey = Join-Path $sourcePath "private-key.pem"
$previousPath = Join-Path $tlsPath "previous"
$previousCertificate = Join-Path $previousPath "certificate.pem"
$previousPrivateKey = Join-Path $previousPath "private-key.pem"

try {
    New-Item -ItemType Directory -Path $sourcePath -Force | Out-Null
    New-Item -ItemType Directory -Path $statePath -Force | Out-Null
    New-Item -ItemType Directory -Path $previousPath -Force | Out-Null
    Set-Content -LiteralPath $sourceCertificate -Value "NEW_CERTIFICATE" -Encoding UTF8
    Set-Content -LiteralPath $sourcePrivateKey -Value "NEW_PRIVATE_KEY" -Encoding UTF8
    Set-Content -LiteralPath $previousCertificate -Value "OLD_CERTIFICATE" -Encoding UTF8
    Set-Content -LiteralPath $previousPrivateKey -Value "OLD_PRIVATE_KEY" -Encoding UTF8

    # Simula uma instalacao anterior permissiva. A primeira transacao deve
    # remover este ACE explicito antes de manipular qualquer chave nova.
    $permissiveAcl = Get-Acl -LiteralPath $previousPrivateKey
    $everyoneSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-1-0")
    $permissiveRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $everyoneSid,
        [System.Security.AccessControl.FileSystemRights]::Read,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$permissiveAcl.AddAccessRule($permissiveRule)
    Set-Acl -LiteralPath $previousPrivateKey -AclObject $permissiveAcl

    Set-Content `
        -LiteralPath $script:envPath `
        -Value @(
            "PORT=3001",
            "ANDON_TIME_ZONE=UTC",
            "CUSTOM_INTEGRATION_MODE=isolated",
            "# comentario preservado"
        ) `
        -Encoding UTF8
    $preservedEnvLines = @(
        Get-AndonPreservedEnvLines `
            -Path $script:envPath `
            -ManagedVariableNames @("PORT", "ANDON_TLS_CERT")
    )
    Assert-TransportTest `
        -Condition ($preservedEnvLines -contains "ANDON_TIME_ZONE=UTC") `
        -Message "Variavel adicional do backend deve ser preservada"
    Assert-TransportTest `
        -Condition ($preservedEnvLines -contains "CUSTOM_INTEGRATION_MODE=isolated") `
        -Message "Integracao adicional do backend deve ser preservada"
    Assert-TransportTest `
        -Condition ($preservedEnvLines -notcontains "PORT=3001") `
        -Message "Variavel gerenciada nao pode ser duplicada"
    Set-Content -LiteralPath $script:envPath -Value "PORT=4001" -Encoding UTF8
    Add-AndonPreservedEnvLines -Path $script:envPath -Lines $preservedEnvLines
    $mergedEnv = Get-Content -LiteralPath $script:envPath
    Assert-TransportTest `
        -Condition (
            $mergedEnv -contains "PORT=4001" -and
            $mergedEnv -contains "ANDON_TIME_ZONE=UTC" -and
            $mergedEnv -contains "CUSTOM_INTEGRATION_MODE=isolated"
        ) `
        -Message "Arquivo gerado deve combinar transporte e configuracoes adicionais"

    $statePaths = @($script:configPath, $script:networkPath, $script:envPath)
    $failurePoints = @(
        "after_tls_copy",
        "after_tls_activate",
        "after_config",
        "after_network",
        "after_env",
        "before_final_acl",
        "after_acl_validation"
    )

    foreach ($failurePoint in $failurePoints) {
        Set-TestState -ConfigValue "OLD_CONFIG" -NetworkValue "OLD_NETWORK" -EnvValue "OLD_ENV"
        $caught = ""
        try {
            Invoke-AndonTransportTransaction `
                -TlsPath $tlsPath `
                -StatePaths $statePaths `
                -SourceCertificatePath $sourceCertificate `
                -SourcePrivateKeyPath $sourcePrivateKey `
                -FailurePoint $failurePoint `
                -Mutation {
                    param($certificatePath, $privateKeyPath, $injectedFailure)
                    Set-Content -LiteralPath $script:configPath -Value "NEW_CONFIG" -Encoding UTF8
                    Invoke-AndonTransportFailurePoint -Point "after_config" -FailurePoint $injectedFailure
                    Set-Content -LiteralPath $script:networkPath -Value "NEW_NETWORK" -Encoding UTF8
                    Invoke-AndonTransportFailurePoint -Point "after_network" -FailurePoint $injectedFailure
                    Set-Content -LiteralPath $script:envPath -Value "NEW_ENV" -Encoding UTF8
                    Invoke-AndonTransportFailurePoint -Point "after_env" -FailurePoint $injectedFailure
                } |
                Out-Null
        } catch {
            $caught = $_.Exception.Message
        }

        Assert-TransportTest `
            -Condition ($caught -match "estado anterior restaurado") `
            -Message "Falha $failurePoint deve confirmar rollback"
        Assert-TestState -ConfigValue "OLD_CONFIG" -NetworkValue "OLD_NETWORK" -EnvValue "OLD_ENV"
        Assert-TransportTest `
            -Condition ((Get-Content $previousCertificate -Raw).Trim() -eq "OLD_CERTIFICATE") `
            -Message "Certificado anterior deve permanecer intacto em $failurePoint"
        Assert-TransportTest `
            -Condition ((Get-Content $previousPrivateKey -Raw).Trim() -eq "OLD_PRIVATE_KEY") `
            -Message "Chave anterior deve permanecer intacta em $failurePoint"
        Assert-TransportTest `
            -Condition (@(Get-ChildItem $tlsPath -Directory -Filter "active-*" -ErrorAction SilentlyContinue).Count -eq 0) `
            -Message "Par TLS incompleto nao pode permanecer ativo em $failurePoint"
        Assert-TransportTest `
            -Condition (@(Get-ChildItem $tlsPath -Directory -Filter ".transaction-*" -Force -ErrorAction SilentlyContinue).Count -eq 0) `
            -Message "Backup temporario deve ser removido apos rollback valido"

        $newPrivateCopies = @(
            Get-ChildItem $tlsPath -File -Recurse -Force |
                Where-Object { (Get-Content $_.FullName -Raw) -match "NEW_PRIVATE_KEY" }
        )
        Assert-TransportTest `
            -Condition ($newPrivateCopies.Count -eq 0) `
            -Message "Chave nova nao pode ficar exposta apos $failurePoint"
        Assert-AndonRestrictedTlsAcl -Path $tlsPath
    }

    Set-TestState -ConfigValue "OLD_CONFIG" -NetworkValue "OLD_NETWORK" -EnvValue "OLD_ENV"
    $success = Invoke-AndonTransportTransaction `
        -TlsPath $tlsPath `
        -StatePaths $statePaths `
        -SourceCertificatePath $sourceCertificate `
        -SourcePrivateKeyPath $sourcePrivateKey `
        -Mutation {
            param($certificatePath, $privateKeyPath, $injectedFailure)
            Set-Content -LiteralPath $script:configPath -Value $certificatePath -Encoding UTF8
            Set-Content -LiteralPath $script:networkPath -Value "NEW_NETWORK" -Encoding UTF8
            Set-Content -LiteralPath $script:envPath -Value $privateKeyPath -Encoding UTF8
        }

    Assert-TransportTest `
        -Condition (Test-Path $success.CertificatePath -PathType Leaf) `
        -Message "Certificado novo deve ser ativado somente no sucesso"
    Assert-TransportTest `
        -Condition (Test-Path $success.PrivateKeyPath -PathType Leaf) `
        -Message "Chave nova deve ser ativada somente no sucesso"
    Assert-AndonRestrictedTlsAcl -Path (Split-Path -Parent $success.PrivateKeyPath)

    $successfulConfig = (Get-Content $script:configPath -Raw).Trim()
    $successfulNetwork = (Get-Content $script:networkPath -Raw).Trim()
    $successfulEnv = (Get-Content $script:envPath -Raw).Trim()
    $httpRollbackFailure = ""
    try {
        Invoke-AndonTransportTransaction `
            -TlsPath $tlsPath `
            -StatePaths $statePaths `
            -FailurePoint "after_env" `
            -Mutation {
                param($certificatePath, $privateKeyPath, $injectedFailure)
                Set-Content -LiteralPath $script:configPath -Value "HTTP_CONFIG" -Encoding UTF8
                Set-Content -LiteralPath $script:networkPath -Value "HTTP_NETWORK" -Encoding UTF8
                Set-Content -LiteralPath $script:envPath -Value "HTTP_ENV" -Encoding UTF8
                Invoke-AndonTransportFailurePoint -Point "after_env" -FailurePoint $injectedFailure
            } |
            Out-Null
    } catch {
        $httpRollbackFailure = $_.Exception.Message
    }

    Assert-TransportTest `
        -Condition ($httpRollbackFailure -match "estado anterior restaurado") `
        -Message "Rollback HTTP tambem deve ser transacional"
    Assert-TestState `
        -ConfigValue $successfulConfig `
        -NetworkValue $successfulNetwork `
        -EnvValue $successfulEnv

    Write-Host "Transacao HTTPS: ACL previa, sete falhas intermediarias e rollback HTTP aprovados."
} finally {
    if (Test-Path $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
