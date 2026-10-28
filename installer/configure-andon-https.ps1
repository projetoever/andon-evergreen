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

# HTTPS local: certificado apenas para a propria maquina (nao para a rede industrial).
# A ferramenta mkcert e destinada exclusivamente ao ambiente local de testes.
function Get-AndonMkcertExecutable {
    $command = Get-Command "mkcert.exe" -ErrorAction SilentlyContinue
    if ($command -and (Test-Path $command.Source -PathType Leaf)) {
        return $command.Source
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\mkcert.exe"),
        (Join-Path $env:USERPROFILE "scoop\shims\mkcert.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate -PathType Leaf) { return $candidate }
    }
    return ""
}

function Ensure-AndonMkcert {
    $mkcertPath = Get-AndonMkcertExecutable
    if (![string]::IsNullOrWhiteSpace($mkcertPath)) { return $mkcertPath }

    $winget = Get-Command "winget.exe" -ErrorAction SilentlyContinue
    if (!$winget) {
        throw (
            "mkcert nao esta instalado e o winget nao esta disponivel. " +
            "Para HTTPS de rede/servidor, use a opcao 3 com certificado da sua autoridade certificadora. " +
            "Para teste local no Windows 10/11, instale mkcert pelo canal oficial."
        )
    }

    Write-AndonWarn "mkcert e uma dependencia apenas do perfil HTTPS LOCAL."
    if (!(Read-AndonYesNo "Instalar mkcert pelo Windows Package Manager (winget)?" $false)) {
        throw "Instalacao local cancelada. Nenhum certificado foi criado."
    }

    & $winget.Source install --id FiloSottile.mkcert --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao instalar mkcert pelo winget. Nenhuma configuracao HTTPS foi alterada."
    }

    $mkcertPath = Get-AndonMkcertExecutable
    if ([string]::IsNullOrWhiteSpace($mkcertPath)) {
        throw (
            "mkcert foi instalado mas nao esta acessivel nesta sessao. " +
            "Feche e reabra o menu ANDON antes de repetir a opcao 14."
        )
    }
    return $mkcertPath
}

$script:AndonLocalTlsTemp = ""
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
    Write-Host "2 - HTTPS LOCAL assistido (acesso somente neste computador)"
    Write-Host "3 - HTTPS DE REDE (certificado emitido por CA confiavel)"
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

    if ($choice -notin @("2", "3")) { throw "Opcao invalida." }

    if ($choice -eq "2") {
        Write-AndonHeader "HTTPS LOCAL - CONFIGURACAO ASSISTIDA"
        Write-AndonWarn "Este perfil funciona somente no computador atual, nao na rede da fabrica."
        Write-AndonWarn "Uma CA LOCAL sera confiada ao Windows com sua aprovacao explicita."
        Write-AndonWarn "Nao utilize certificados mkcert para servidor produtivo ou outros dispositivos."

        if (!(Read-AndonYesNo "Autoriza configurar a confianca local neste computador?" $false)) {
            Write-AndonWarn "Operacao cancelada. Configuracao atual preservada."
            exit 0
        }

        $mkcert = Ensure-AndonMkcert
        & $mkcert -install
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao registrar a CA local. Configuracao ANDON preservada."
        }

        $httpsHost = "127.0.0.1"
        New-Item -ItemType Directory -Path $tlsPath -Force | Out-Null
        $script:AndonLocalTlsTemp = Join-Path $tlsPath ("local-setup-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $script:AndonLocalTlsTemp -Force | Out-Null
        Set-AndonRestrictedTlsAcl -Path $script:AndonLocalTlsTemp
        Assert-AndonRestrictedTlsAcl -Path $script:AndonLocalTlsTemp

        $sourceCertificate = Join-Path $script:AndonLocalTlsTemp "certificate.pem"
        $sourcePrivateKey = Join-Path $script:AndonLocalTlsTemp "private-key.pem"
        & $mkcert -cert-file $sourceCertificate -key-file $sourcePrivateKey "127.0.0.1" "localhost" "::1"
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao emitir certificado local. A configuracao do ANDON nao foi alterada."
        }
        Set-AndonRestrictedTlsAcl -Path $script:AndonLocalTlsTemp
        Assert-AndonRestrictedTlsAcl -Path $script:AndonLocalTlsTemp
    } else {
        Write-AndonHeader "HTTPS DE REDE - CERTIFICADO DA EMPRESA"
        Write-AndonWarn "A CA precisa ser confiavel em cada navegador e cliente industrial."
        do {
            $httpsHost = (Read-Host "Nome DNS ou IP coberto pelo certificado (sem https:// ou porta)").Trim()
            if (!(Test-AndonHttpsHost -HostName $httpsHost)) {
                Write-AndonFail "Host HTTPS invalido. Nao informe protocolo, porta ou caminho."
            }
        } while (!(Test-AndonHttpsHost -HostName $httpsHost))

        $sourceCertificate = (Read-Host "Caminho completo do certificado PEM confiavel").Trim('"').Trim()
        $sourcePrivateKey = (Read-Host "Caminho completo da chave privada PEM").Trim('"').Trim()
    }
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
} finally {
    if (
        ![string]::IsNullOrWhiteSpace($script:AndonLocalTlsTemp) -and
        (Test-Path $script:AndonLocalTlsTemp)
    ) {
        Remove-Item -LiteralPath $script:AndonLocalTlsTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
