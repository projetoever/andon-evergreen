. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Transport.ps1"

$ErrorActionPreference = "Stop"

function Assert-AndonStoppedForTransportChange {
    $config = Import-AndonConfig
    foreach ($port in @([int]$config.apiPort, [int]$config.frontendPort)) {
        if (Test-AndonPortInUse -Port $port) {
            throw (
                "A porta $port esta em uso. Pare o ANDON pela opcao 5 " +
                "antes de alterar HTTP/HTTPS."
            )
        }
    }
}

function Test-AndonHttpsHost {
    param([string]$HostName)
    if ([string]::IsNullOrWhiteSpace($HostName)) { return $false }
    return $HostName -match '^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$'
}

function Assert-AndonTlsPair {
    param(
        [string]$CertificatePath,
        [string]$PrivateKeyPath,
        [string]$HttpsHost
    )

    foreach ($path in @($CertificatePath, $PrivateKeyPath)) {
        if (!(Test-Path $path -PathType Leaf)) {
            throw "Arquivo TLS nao encontrado: $path"
        }
    }

    Ensure-AndonDedicatedNodeRuntime
    $validator = "$Global:AndonProjectPath\scripts\serve-frontend.mjs"
    if (!(Test-Path $validator -PathType Leaf)) {
        throw "Validador TLS nao encontrado: $validator"
    }

    $previousCert = $env:ANDON_TLS_CERT
    $previousKey = $env:ANDON_TLS_KEY
    $previousHost = $env:ANDON_TLS_HOST
    try {
        $env:ANDON_TLS_CERT = $CertificatePath
        $env:ANDON_TLS_KEY = $PrivateKeyPath
        $env:ANDON_TLS_HOST = $HttpsHost
        & $Global:AndonNodeExePath $validator --validate-tls
        if ($LASTEXITCODE -ne 0) {
            throw "Certificado, chave privada ou host HTTPS invalidos."
        }
    } finally {
        if ($null -eq $previousCert) { Remove-Item Env:\ANDON_TLS_CERT -ErrorAction SilentlyContinue } else { $env:ANDON_TLS_CERT = $previousCert }
        if ($null -eq $previousKey) { Remove-Item Env:\ANDON_TLS_KEY -ErrorAction SilentlyContinue } else { $env:ANDON_TLS_KEY = $previousKey }
        if ($null -eq $previousHost) { Remove-Item Env:\ANDON_TLS_HOST -ErrorAction SilentlyContinue } else { $env:ANDON_TLS_HOST = $previousHost }
    }

    $certutil = Get-Command certutil.exe -ErrorAction SilentlyContinue
    if (!$certutil) { throw "certutil.exe nao encontrado para validar a confianca do certificado." }
    & $certutil.Source -verify $CertificatePath 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw (
            "O certificado nao foi validado pela cadeia confiavel do Windows. " +
            "Instale/conceda confianca manualmente antes de configurar o ANDON."
        )
    }
}

function Get-AndonTransportServerIp {
    $network = Get-AndonNetworkConfig
    if ($network -and (Test-AndonIPv4 "$($network.serverIp)")) {
        return "$($network.serverIp)"
    }
    return "127.0.0.1"
}

try {
    Assert-AndonAdmin
    Assert-AndonStoppedForTransportChange
    $config = Import-AndonConfig
    $serverIp = Get-AndonTransportServerIp
    $tlsPath = Join-Path $Global:AndonBasePath "tls"
    $backendEnvPath = Join-Path $Global:AndonProjectPath "server\.env"
    $managedBackendEnvNames = @(
        "PORT",
        "HOST",
        "DATABASE_URL",
        "CORS_ORIGINS",
        "ANDON_ACCESS_ORIGIN",
        "ANDON_CENTRAL_ACCESS_ENABLED",
        "ANDON_TLS_CERT",
        "ANDON_TLS_KEY"
    )
    $preservedBackendEnvLines = @(
        Get-AndonPreservedEnvLines `
            -Path $backendEnvPath `
            -ManagedVariableNames $managedBackendEnvNames
    )
    $statePaths = @(
        $Global:AndonConfigPath,
        $Global:AndonNetworkConfigPath,
        $backendEnvPath
    )

    Write-AndonHeader "CONFIGURAR TRANSPORTE HTTP/HTTPS"
    Write-Host "Modo atual: $($config.transportMode.ToUpperInvariant())"
    Write-Host "1 - HTTP legado (rollback, padrao)"
    Write-Host "2 - HTTPS com certificado confiavel existente"
    Write-Host "0 - Cancelar"
    Write-Host ""
    $choice = Read-Host "Escolha o modo"

    if ($choice -eq "0") {
        Write-AndonWarn "Configuracao cancelada."
        exit 0
    }

    if ($choice -eq "1") {
        Invoke-AndonTransportTransaction `
            -TlsPath $tlsPath `
            -StatePaths $statePaths `
            -Mutation {
                param($certificatePath, $privateKeyPath, $failurePoint)
                $config = Set-AndonConfigProperty -Config $config -Name "transportMode" -Value "http"
                $config = Set-AndonConfigProperty -Config $config -Name "httpsHost" -Value ""
                $config = Set-AndonConfigProperty -Config $config -Name "centralAccessEnabled" -Value $false
                Save-AndonConfig $config
                Invoke-AndonTransportFailurePoint -Point "after_config" -FailurePoint $failurePoint
                $updatedNetwork = Save-AndonNetworkConfig -ServerIp $serverIp -Config $config
                Invoke-AndonTransportFailurePoint -Point "after_network" -FailurePoint $failurePoint
                Write-AndonBackendEnv -Config $config -NetworkConfig $updatedNetwork
                Add-AndonPreservedEnvLines `
                    -Path $backendEnvPath `
                    -Lines $preservedBackendEnvLines
                Invoke-AndonTransportFailurePoint -Point "after_env" -FailurePoint $failurePoint
            } |
            Out-Null
        Write-AndonOk "Rollback configurado. A opcao 4 iniciara o ANDON em HTTP."
        exit 0
    }

    if ($choice -ne "2") { throw "Opcao invalida." }

    do {
        $httpsHost = (Read-Host "Host presente no certificado (use 127.0.0.1 no notebook para preservar a workstation)").Trim()
        if (!(Test-AndonHttpsHost -HostName $httpsHost)) {
            Write-AndonFail "Host HTTPS invalido. Nao informe protocolo, porta ou caminho."
        }
    } while (!(Test-AndonHttpsHost -HostName $httpsHost))

    $sourceCertificate = (Read-Host "Caminho completo do certificado PEM confiavel").Trim('"').Trim()
    $sourcePrivateKey = (Read-Host "Caminho completo da chave privada PEM").Trim('"').Trim()
    Assert-AndonTlsPair -CertificatePath $sourceCertificate -PrivateKeyPath $sourcePrivateKey -HttpsHost $httpsHost

    Invoke-AndonTransportTransaction `
        -TlsPath $tlsPath `
        -StatePaths $statePaths `
        -SourceCertificatePath $sourceCertificate `
        -SourcePrivateKeyPath $sourcePrivateKey `
        -Mutation {
            param($certificatePath, $privateKeyPath, $failurePoint)
            $config = Set-AndonConfigProperty -Config $config -Name "transportMode" -Value "https"
            $config = Set-AndonConfigProperty -Config $config -Name "httpsHost" -Value $httpsHost
            $config = Set-AndonConfigProperty -Config $config -Name "tlsCertificatePath" -Value $certificatePath
            $config = Set-AndonConfigProperty -Config $config -Name "tlsPrivateKeyPath" -Value $privateKeyPath
            $config = Set-AndonConfigProperty -Config $config -Name "centralAccessEnabled" -Value $false
            Save-AndonConfig $config
            Invoke-AndonTransportFailurePoint -Point "after_config" -FailurePoint $failurePoint
            $updatedNetwork = Save-AndonNetworkConfig -ServerIp $serverIp -Config $config
            Invoke-AndonTransportFailurePoint -Point "after_network" -FailurePoint $failurePoint
            Write-AndonBackendEnv -Config $config -NetworkConfig $updatedNetwork
            Add-AndonPreservedEnvLines `
                -Path $backendEnvPath `
                -Lines $preservedBackendEnvLines
            Invoke-AndonTransportFailurePoint -Point "after_env" -FailurePoint $failurePoint
        } |
        Out-Null

    Write-AndonOk "HTTPS configurado com certificado confiavel existente."
    Write-AndonWarn "A autenticacao central continua desligada."
    Write-AndonOk "Use a opcao 4 para iniciar o ANDON em https://$httpsHost`:$($config.frontendPort)."
    exit 0
} catch {
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
