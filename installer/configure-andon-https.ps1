. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"

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

function Save-AndonTransportNetwork {
    param([object]$Config)
    $network = Get-AndonNetworkConfig
    $serverIp = if ($network -and (Test-AndonIPv4 "$($network.serverIp)")) {
        "$($network.serverIp)"
    } else {
        "127.0.0.1"
    }
    $updatedNetwork = Save-AndonNetworkConfig -ServerIp $serverIp -Config $Config
    Write-AndonBackendEnv -Config $Config -NetworkConfig $updatedNetwork
}

try {
    Assert-AndonAdmin
    Assert-AndonStoppedForTransportChange
    $config = Import-AndonConfig

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
        $config = Set-AndonConfigProperty -Config $config -Name "transportMode" -Value "http"
        $config = Set-AndonConfigProperty -Config $config -Name "httpsHost" -Value ""
        $config = Set-AndonConfigProperty -Config $config -Name "centralAccessEnabled" -Value $false
        Save-AndonConfig $config
        Save-AndonTransportNetwork -Config $config
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

    $tlsPath = Join-Path $Global:AndonBasePath "tls"
    $stagingPath = Join-Path $tlsPath ("staging-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
    try {
        $stagedCertificate = Join-Path $stagingPath "certificate.pem"
        $stagedPrivateKey = Join-Path $stagingPath "private-key.pem"
        Copy-Item -LiteralPath $sourceCertificate -Destination $stagedCertificate -Force
        Copy-Item -LiteralPath $sourcePrivateKey -Destination $stagedPrivateKey -Force

        New-Item -ItemType Directory -Path $tlsPath -Force | Out-Null
        $targetCertificate = Join-Path $tlsPath "certificate.pem"
        $targetPrivateKey = Join-Path $tlsPath "private-key.pem"
        Move-Item -LiteralPath $stagedCertificate -Destination $targetCertificate -Force
        Move-Item -LiteralPath $stagedPrivateKey -Destination $targetPrivateKey -Force
        & icacls.exe $tlsPath "/inheritance:r" "/grant:r" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "/T" 1>$null
        if ($LASTEXITCODE -ne 0) { throw "Falha ao restringir as permissoes dos arquivos TLS." }
    } finally {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    $config = Set-AndonConfigProperty -Config $config -Name "transportMode" -Value "https"
    $config = Set-AndonConfigProperty -Config $config -Name "httpsHost" -Value $httpsHost
    $config = Set-AndonConfigProperty -Config $config -Name "tlsCertificatePath" -Value $targetCertificate
    $config = Set-AndonConfigProperty -Config $config -Name "tlsPrivateKeyPath" -Value $targetPrivateKey
    $config = Set-AndonConfigProperty -Config $config -Name "centralAccessEnabled" -Value $false
    Save-AndonConfig $config
    Save-AndonTransportNetwork -Config $config

    Write-AndonOk "HTTPS configurado com certificado confiavel existente."
    Write-AndonWarn "A autenticacao central continua desligada."
    Write-AndonOk "Use a opcao 4 para iniciar o ANDON em https://$httpsHost`:$($config.frontendPort)."
    exit 0
} catch {
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
