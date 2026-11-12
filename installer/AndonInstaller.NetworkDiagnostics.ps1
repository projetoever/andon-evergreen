# Read-only HTTPS/LAN diagnostics for operator and IT.
# Does not open ports, alter trust stores, export keys, accept foreign CA,
# modify ANDON settings or assume remote mobile access works.

function Get-AndonLanBindStatus {
    param(
        [string[]]$ListenerAddresses = @(),
        [string]$LanIpv4 = ""
    )
    if ($ListenerAddresses.Count -eq 0) { return "NO_LISTENER" }
    if (@($ListenerAddresses | Where-Object { $_ -in @("0.0.0.0", "::", "[::]") }).Count -gt 0) {
        return "ALL_INTERFACES"
    }
    if (![string]::IsNullOrWhiteSpace($LanIpv4) -and
        $ListenerAddresses -contains $LanIpv4) {
        return "LAN_INTERFACE"
    }
    if (@($ListenerAddresses | Where-Object {
        $_ -notin @("127.0.0.1", "::1", "[::1]")
    }).Count -eq 0) {
        return "LOOPBACK_ONLY"
    }
    return "OTHER_INTERFACE"
}

function Show-AndonHttpsNetworkDiagnostics {
    param([object]$Config = $null)

    if (!$Config) { $Config = Import-AndonConfig }
    if ("$($Config.transportMode)".Trim().ToLowerInvariant() -ne "https") {
        Write-AndonWarn "Diagnostico de rede HTTPS ignorado: transporte atual nao e HTTPS."
        return
    }
    Write-AndonHeader "DIAGNOSTICO HTTPS REDE (SOMENTE LEITURA)"
    $network = Get-AndonNetworkConfig
    $serverIpv4 = if ($network -and "$($network.serverIp)") {
        "$($network.serverIp)"
    } else { "" }
    $httpsHost = "$($Config.httpsHost)".Trim()
    Write-Host ("Host HTTPS configurado: {0}" -f $httpsHost)
    Write-Host ("IPv4 de rede configurado: {0}" -f $(if ($serverIpv4) { $serverIpv4 } else { "nao identificado" }))

    $ipAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    if ($serverIpv4 -and
        @($ipAddresses | Where-Object { $_.IPAddress -eq $serverIpv4 }).Count -eq 0) {
        Write-AndonWarn "IPv4 configurado nao esta presente neste computador. Confira o Wi-Fi/IP atual; nao troque para IP virtual."
    }

    $profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
    foreach ($profile in $profiles) {
        # Intentionally do not display Wi-Fi SSID, gateways or user secrets.
        Write-Host ("Adaptador {0}: perfil de firewall {1}" -f $profile.InterfaceAlias, $profile.NetworkCategory)
    }

    foreach ($service in @(
        @{ Name = "Frontend"; Port = [int]$Config.frontendPort; Rule = "ANDON Frontend $($Config.frontendPort)" },
        @{ Name = "API"; Port = [int]$Config.apiPort; Rule = "ANDON API $($Config.apiPort)" }
    )) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue)
        $addresses = @($listeners | ForEach-Object { "$($_.LocalAddress)" } | Sort-Object -Unique)
        $bind = Get-AndonLanBindStatus -ListenerAddresses $addresses -LanIpv4 $serverIpv4
        Write-Host ("{0} :{1} | bind={2} | enderecos={3}" -f
            $service.Name, $service.Port, $bind, ($addresses -join ","))
        if ($bind -in @("NO_LISTENER", "LOOPBACK_ONLY", "OTHER_INTERFACE")) {
            Write-AndonWarn "O servico pode nao estar acessivel pela interface Wi-Fi; verifique bind e inicializacao."
        }

        $rule = Get-NetFirewallRule -DisplayName $service.Rule -ErrorAction SilentlyContinue
        if (!$rule) {
            Write-AndonWarn "Regra de entrada nao encontrada: $($service.Rule). Nao criar automaticamente."
        } else {
            foreach ($item in @($rule)) {
                Write-Host ("Firewall {0}: enabled={1}, action={2}, profile={3}" -f
                    $service.Rule, $item.Enabled, $item.Action, $item.Profile)
                if ("$($item.Enabled)" -ne "True" -or "$($item.Action)" -ne "Allow") {
                    Write-AndonWarn "Firewall pode bloquear a entrada; validar com a TI antes de alterar regra."
                }
            }
        }
    }

    if ("$($Config.tlsCertificatePath)".Trim() -and
        (Test-Path "$($Config.tlsCertificatePath)" -PathType Leaf)) {
        try {
            $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("$($Config.tlsCertificatePath)")
            Write-Host ("Certificado servidor: validade ate {0}" -f $certificate.NotAfter.ToString("yyyy-MM-dd"))
            if ((Get-Date) -gt $certificate.NotAfter) {
                Write-AndonWarn "Certificado expirado. Emita certificado confiavel antes de acesso remoto."
            }
        } catch {
            Write-AndonWarn "Certificado do servidor nao pode ser lido; validar a configuracao TLS."
        }
    } else {
        Write-AndonWarn "Caminho de certificado TLS nao encontrado na configuracao."
    }

    Write-Host "Teste no celular (mesmo Wi-Fi e sem dados moveis):"
    Write-Host ("  1. https://{0}:{1}/health  (API, leitura publica sem dados internos)" -f $httpsHost, $Config.apiPort)
    Write-Host ("  2. https://{0}:{1}/hub  (interface, exige login/permissoes)" -f $httpsHost, $Config.frontendPort)
    Write-AndonWarn "Timeout/sem resposta: Wi-Fi client isolation, IP alterado, bind, firewall ou roteamento."
    Write-AndonWarn "Aviso de certificado: CA mkcert nao e confiada automaticamente no smartphone. Preferir CA corporativa/gerenciada."
    Write-AndonWarn "403 apos conexao: workstation/sessao nao autorizada. Nao desligar autenticacao nem desabilitar validacao TLS."
    Write-Host "Diagnostico local NAO comprova chegada de pacotes do smartphone e nao instala certificados."
}
