$ErrorActionPreference = "Stop"

$script:AndonTlsAllowedSids = @(
    "S-1-5-18",       # SYSTEM
    "S-1-5-32-544"   # BUILTIN\Administrators
)

function Set-AndonRestrictedTlsAcl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (!(Test-Path $Path)) {
        throw "Caminho TLS inexistente para aplicar ACL: $Path"
    }

    $items = @(
        Get-Item -LiteralPath $Path -Force
        Get-ChildItem -LiteralPath $Path -Force -Recurse
    )

    foreach ($item in $items) {
        $acl = if ($item.PSIsContainer) {
            [System.Security.AccessControl.DirectorySecurity]::new()
        } else {
            [System.Security.AccessControl.FileSecurity]::new()
        }
        $acl.SetAccessRuleProtection($true, $false)

        foreach ($sidValue in $script:AndonTlsAllowedSids) {
            $sid = [System.Security.Principal.SecurityIdentifier]::new(
                $sidValue
            )
            $inheritance = if ($item.PSIsContainer) {
                [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
                [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
            } else {
                [System.Security.AccessControl.InheritanceFlags]::None
            }
            $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
                $sid,
                [System.Security.AccessControl.FileSystemRights]::FullControl,
                $inheritance,
                [System.Security.AccessControl.PropagationFlags]::None,
                [System.Security.AccessControl.AccessControlType]::Allow
            )
            [void]$acl.AddAccessRule($rule)
        }

        Set-Acl -LiteralPath $item.FullName -AclObject $acl
    }
}

function Assert-AndonRestrictedTlsAcl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (!(Test-Path $Path)) {
        throw "Caminho TLS inexistente para validar ACL: $Path"
    }

    $items = @(
        Get-Item -LiteralPath $Path -Force
        Get-ChildItem -LiteralPath $Path -Force -Recurse
    )

    foreach ($item in $items) {
        $acl = Get-Acl -LiteralPath $item.FullName
        if (!$acl.AreAccessRulesProtected) {
            throw "ACL TLS ainda permite heranca: $($item.FullName)"
        }

        $allowedSidsFound = @{}
        foreach ($rule in $acl.Access) {
            if (
                $rule.AccessControlType -ne
                [System.Security.AccessControl.AccessControlType]::Allow
            ) {
                continue
            }

            try {
                $sid = $rule.IdentityReference.Translate(
                    [System.Security.Principal.SecurityIdentifier]
                ).Value
            } catch {
                throw "Identidade invalida na ACL TLS de $($item.FullName)."
            }

            if ($script:AndonTlsAllowedSids -notcontains $sid) {
                throw "ACL TLS possui permissao inesperada para $sid em $($item.FullName)."
            }

            $fullControl =
                [System.Security.AccessControl.FileSystemRights]::FullControl
            if (($rule.FileSystemRights -band $fullControl) -ne $fullControl) {
                throw "ACL TLS insuficiente para $sid em $($item.FullName)."
            }

            $allowedSidsFound[$sid] = $true
        }

        foreach ($requiredSid in $script:AndonTlsAllowedSids) {
            if (!$allowedSidsFound.ContainsKey($requiredSid)) {
                throw "ACL TLS nao contem $requiredSid em $($item.FullName)."
            }
        }
    }
}

function Invoke-AndonTransportFailurePoint {
    param(
        [string]$Point,
        [string]$FailurePoint = ""
    )

    if (
        ![string]::IsNullOrWhiteSpace($FailurePoint) -and
        $FailurePoint -eq $Point
    ) {
        throw "Falha intermediaria injetada para teste: $Point"
    }
}

function Save-AndonTransportStateSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$StatePaths,
        [Parameter(Mandatory = $true)]
        [string]$BackupPath
    )

    $snapshots = @()
    for ($index = 0; $index -lt $StatePaths.Count; $index++) {
        $statePath = $StatePaths[$index]
        $exists = Test-Path $statePath -PathType Leaf
        $backupFile = Join-Path $BackupPath ("state-$index.bin")

        if ($exists) {
            Copy-Item -LiteralPath $statePath -Destination $backupFile -Force
        }

        $snapshots += [pscustomobject]@{
            Path = $statePath
            Existed = $exists
            BackupFile = $backupFile
        }
    }

    Set-AndonRestrictedTlsAcl -Path $BackupPath
    Assert-AndonRestrictedTlsAcl -Path $BackupPath
    return $snapshots
}

function Restore-AndonTransportStateSnapshot {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Snapshots
    )

    foreach ($snapshot in $Snapshots) {
        if ($snapshot.Existed) {
            $parentPath = Split-Path -Parent $snapshot.Path
            if (!(Test-Path $parentPath -PathType Container)) {
                New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
            }
            Copy-Item `
                -LiteralPath $snapshot.BackupFile `
                -Destination $snapshot.Path `
                -Force
        } else {
            Remove-Item `
                -LiteralPath $snapshot.Path `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-AndonTransportTransaction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TlsPath,
        [Parameter(Mandatory = $true)]
        [string[]]$StatePaths,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Mutation,
        [string]$SourceCertificatePath = "",
        [string]$SourcePrivateKeyPath = "",
        [string]$FailurePoint = ""
    )

    if (
        [string]::IsNullOrWhiteSpace($SourceCertificatePath) -ne
        [string]::IsNullOrWhiteSpace($SourcePrivateKeyPath)
    ) {
        throw "Certificado e chave TLS devem ser fornecidos juntos."
    }

    $usesTlsPair = ![string]::IsNullOrWhiteSpace($SourceCertificatePath)
    if ($usesTlsPair) {
        foreach ($sourcePath in @($SourceCertificatePath, $SourcePrivateKeyPath)) {
            if (!(Test-Path $sourcePath -PathType Leaf)) {
                throw "Arquivo TLS de origem nao encontrado: $sourcePath"
            }
        }
    }

    New-Item -ItemType Directory -Path $TlsPath -Force | Out-Null
    Set-AndonRestrictedTlsAcl -Path $TlsPath
    Assert-AndonRestrictedTlsAcl -Path $TlsPath

    $transactionId = [guid]::NewGuid().ToString("N")
    $transactionPath = Join-Path $TlsPath ".transaction-$transactionId"
    $backupPath = Join-Path $transactionPath "backup"
    $stagingPath = Join-Path $transactionPath "staging"
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null

    # A ACL e aplicada e comprovada antes de qualquer configuracao ou chave
    # privada ser copiada para backup/staging.
    Set-AndonRestrictedTlsAcl -Path $transactionPath
    Assert-AndonRestrictedTlsAcl -Path $transactionPath

    $snapshots = @()
    $activePath = ""
    $activeCertificatePath = ""
    $activePrivateKeyPath = ""
    $cleanupTransaction = $false

    try {
        $snapshots = Save-AndonTransportStateSnapshot `
            -StatePaths $StatePaths `
            -BackupPath $backupPath

        if ($usesTlsPair) {
            $stagedCertificatePath = Join-Path $stagingPath "certificate.pem"
            $stagedPrivateKeyPath = Join-Path $stagingPath "private-key.pem"
            Copy-Item `
                -LiteralPath $SourceCertificatePath `
                -Destination $stagedCertificatePath `
                -Force
            Copy-Item `
                -LiteralPath $SourcePrivateKeyPath `
                -Destination $stagedPrivateKeyPath `
                -Force

            Set-AndonRestrictedTlsAcl -Path $stagingPath
            Assert-AndonRestrictedTlsAcl -Path $stagingPath
            Invoke-AndonTransportFailurePoint `
                -Point "after_tls_copy" `
                -FailurePoint $FailurePoint

            $activePath = Join-Path $TlsPath "active-$transactionId"
            Move-Item -LiteralPath $stagingPath -Destination $activePath
            Set-AndonRestrictedTlsAcl -Path $activePath
            Assert-AndonRestrictedTlsAcl -Path $activePath
            $activeCertificatePath = Join-Path $activePath "certificate.pem"
            $activePrivateKeyPath = Join-Path $activePath "private-key.pem"

            Invoke-AndonTransportFailurePoint `
                -Point "after_tls_activate" `
                -FailurePoint $FailurePoint
        }

        & $Mutation $activeCertificatePath $activePrivateKeyPath $FailurePoint

        Invoke-AndonTransportFailurePoint `
            -Point "before_final_acl" `
            -FailurePoint $FailurePoint
        Set-AndonRestrictedTlsAcl -Path $TlsPath
        Assert-AndonRestrictedTlsAcl -Path $TlsPath
        Invoke-AndonTransportFailurePoint `
            -Point "after_acl_validation" `
            -FailurePoint $FailurePoint

        $cleanupTransaction = $true
        return [pscustomobject]@{
            CertificatePath = $activeCertificatePath
            PrivateKeyPath = $activePrivateKeyPath
        }
    } catch {
        $originalError = $_.Exception.Message
        try {
            if ($snapshots.Count -gt 0) {
                Restore-AndonTransportStateSnapshot -Snapshots $snapshots
            }
            if (
                ![string]::IsNullOrWhiteSpace($activePath) -and
                (Test-Path $activePath)
            ) {
                Remove-Item -LiteralPath $activePath -Recurse -Force
            }
            Set-AndonRestrictedTlsAcl -Path $TlsPath
            Assert-AndonRestrictedTlsAcl -Path $TlsPath
            $cleanupTransaction = $true
        } catch {
            throw (
                "Falha na atualizacao do transporte: $originalError " +
                "Rollback tambem falhou: $($_.Exception.Message). " +
                "Backup restrito preservado em $transactionPath."
            )
        }

        throw "Falha na atualizacao do transporte; estado anterior restaurado: $originalError"
    } finally {
        if ($cleanupTransaction -and (Test-Path $transactionPath)) {
            Remove-Item -LiteralPath $transactionPath -Recurse -Force
        }
    }
}
