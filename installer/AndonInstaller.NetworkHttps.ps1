# ANDON HTTPS de rede: inventario, DNS e CSR. Nenhuma alteracao de DNS/firewall e feita aqui.
# Compativel com Windows PowerShell 5.1 e Windows Server 2016.

function Test-AndonNetworkHttpsIPv4 {
    param([string]$Address)
    $parsed = $null
    if (![System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) { return $false }
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $bytes = $parsed.GetAddressBytes()
    return ($bytes[0] -ne 0 -and $bytes[0] -ne 127 -and
        $bytes[0] -ne 169 -and $bytes[0] -lt 224 -and
        $Address -ne "255.255.255.255")
}

function Test-AndonNetworkHttpsDns {
    param([string]$DnsName)
    if ([string]::IsNullOrWhiteSpace($DnsName) -or $DnsName.Length -gt 253) {
        return $false
    }
    $labels = $DnsName.Split(".")
    if ($labels.Count -lt 2) { return $false }
    foreach ($label in $labels) {
        if ($label.Length -gt 63 -or $label -notmatch '^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$') {
            return $false
        }
    }
    return $true
}

function Get-AndonNetworkHttpsAddresses {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop)
    return @(
        $addresses |
            Where-Object { (Test-AndonNetworkHttpsIPv4 $_.IPAddress) -and
                ($_.AddressState -eq "Preferred") } |
            Sort-Object IPAddress -Unique |
            Select-Object IPAddress, InterfaceAlias
    )
}

function Get-AndonNetworkHttpsDnsAddresses {
    param([string]$DnsName)
    if (!(Test-AndonNetworkHttpsDns $DnsName)) { throw "Nome DNS invalido." }
    try {
        return @(
            Resolve-DnsName -Name $DnsName -Type A -DnsOnly -ErrorAction Stop |
                Where-Object { $_.Type -eq "A" -and $_.IPAddress } |
                ForEach-Object { $_.IPAddress } |
                Sort-Object -Unique
        )
    } catch {
        return @()
    }
}

function Show-AndonNetworkHttpsDnsGuidance {
    param([string]$DnsName, [string]$Address)
    if (!(Test-AndonNetworkHttpsDns $DnsName) -or !(Test-AndonNetworkHttpsIPv4 $Address)) {
        throw "DNS/IP invalido para orientacao de registro."
    }
    $labels = $DnsName.Split(".")
    $name = $labels[0]
    $zone = ($labels[1..($labels.Count - 1)] -join ".")
    Write-AndonWarn "O nome $DnsName ainda precisa resolver para $Address nos clientes."
    Write-Host "Solicite ao administrador do DNS corporativo um registro A:"
    Write-Host ("  Nome completo: {0}  |  IPv4: {1}" -f $DnsName, $Address)
    Write-Host "Exemplo para zona Windows DNS existente (executar APENAS pelo administrador do DNS):"
    Write-Host ('  Add-DnsServerResourceRecordA -ZoneName "{0}" -Name "{1}" -IPv4Address "{2}"' -f $zone, $name, $Address)
    Write-Host "A zona DNS deve existir e ser administrada pela empresa."
    Write-Host "Depois, confirme de outra estacao: Resolve-DnsName $DnsName -Type A"
    Write-AndonWarn "O assistente NAO executa comandos de DNS nem altera o arquivo hosts."
}

function Select-AndonNetworkHttpsIdentity {
    param([switch]$AllowPendingDns)
    $addresses = @(Get-AndonNetworkHttpsAddresses)
    if ($addresses.Count -eq 0) {
        throw "Nenhum IPv4 valido encontrado. Configure a rede antes de continuar."
    }
    Write-AndonHeader "IDENTIDADE HTTPS NA REDE"
    for ($i = 0; $i -lt $addresses.Count; $i++) {
        Write-Host ("{0} - {1} ({2})" -f ($i + 1), $addresses[$i].IPAddress, $addresses[$i].InterfaceAlias)
    }
    do {
        $choice = (Read-Host "Selecione o numero do IPv4 de rede").Trim()
        $index = 0
        $valid = [int]::TryParse($choice, [ref]$index) -and $index -ge 1 -and $index -le $addresses.Count
        if (!$valid) { Write-AndonWarn "Selecione um numero da lista." }
    } while (!$valid)
    $address = "$($addresses[$index - 1].IPAddress)"
    Write-Host "1 - Usar IP de rede ($address)"
    Write-Host "2 - Usar nome DNS corporativo (recomendado, exige DNS funcionando)"
    $identityChoice = (Read-Host "Escolha o endereco do ANDON").Trim()
    if ($identityChoice -eq "1") {
        return [pscustomobject]@{ HostName = $address; ServerAddress = $address; IsDns = $false; DnsReady = $true }
    }
    if ($identityChoice -ne "2") { throw "Opcao de endereco invalida." }
    $name = (Read-Host "Nome DNS completo (ex.: andon.empresa.internal)").Trim().ToLowerInvariant()
    if (!(Test-AndonNetworkHttpsDns $name)) {
        throw "Nome DNS invalido. Informe um FQDN sem protocolo nem porta."
    }
    $resolved = @(Get-AndonNetworkHttpsDnsAddresses -DnsName $name)
    if ($resolved -notcontains $address) {
        Show-AndonNetworkHttpsDnsGuidance -DnsName $name -Address $address
        if (!$AllowPendingDns -or !(Read-AndonYesNo "Continuar apenas com CSR, sem ativar HTTPS?" $false)) {
            throw "DNS nao aponta para este computador. Crie/corrija o registro antes de usar este host."
        }
        return [pscustomobject]@{ HostName = $name; ServerAddress = $address; IsDns = $true; DnsReady = $false }
    }
    Write-AndonOk "DNS $name resolveu para o IPv4 selecionado ($address)."
    return [pscustomobject]@{ HostName = $name; ServerAddress = $address; IsDns = $true; DnsReady = $true }
}

# Gera apenas a requisicao de assinatura corporativa, nunca um certificado autoassinado.
# A chave permanece restrita no servidor e nao e transmitida para a CA.
function New-AndonNetworkHttpsCsr {
    param([string]$HttpsHost, [string]$TlsPath)
    $isDns = Test-AndonNetworkHttpsDns $HttpsHost
    if (!$isDns -and !(Test-AndonNetworkHttpsIPv4 $HttpsHost)) {
        throw "Host invalido para criar a CSR."
    }
    $openssl = Get-Command "openssl.exe" -ErrorAction SilentlyContinue
    if (!$openssl -or !(Test-Path $openssl.Source -PathType Leaf)) {
        throw "OpenSSL nao encontrado. Instale uma versao confiavel aprovada pela TI para gerar CSR ou importe um par PEM ja emitido."
    }
    $requestRoot = Join-Path $TlsPath "requests"
    New-Item -ItemType Directory -Path $requestRoot -Force | Out-Null
    Set-AndonRestrictedTlsAcl -Path $TlsPath
    Assert-AndonRestrictedTlsAcl -Path $TlsPath
    $directory = Join-Path $requestRoot ("csr-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Set-AndonRestrictedTlsAcl -Path $directory
    Assert-AndonRestrictedTlsAcl -Path $directory
    $keyPath = Join-Path $directory "private-key.pem"
    $csrPath = Join-Path $directory "andon.csr"
    $san = if ($isDns) { "DNS:$HttpsHost" } else { "IP:$HttpsHost" }
    try {
        & $openssl.Source req -new -newkey rsa:3072 -sha256 -nodes -keyout $keyPath -out $csrPath -subj "/CN=$HttpsHost" -addext "subjectAltName=$san"
        if ($LASTEXITCODE -ne 0 -or !(Test-Path $csrPath) -or !(Test-Path $keyPath)) {
            throw "OpenSSL nao conseguiu gerar CSR e chave privada."
        }
        & $openssl.Source req -in $csrPath -noout -verify 1>$null
        if ($LASTEXITCODE -ne 0) { throw "CSR gerada nao passou na validacao." }
        Set-AndonRestrictedTlsAcl -Path $directory
        Assert-AndonRestrictedTlsAcl -Path $directory
        return [pscustomobject]@{ CsrPath = $csrPath; KeyPath = $keyPath; HostName = $HttpsHost }
    } catch {
        if (Test-Path $directory) {
            Remove-Item -LiteralPath $directory -Force -Recurse -ErrorAction SilentlyContinue
        }
        throw
    }
}
