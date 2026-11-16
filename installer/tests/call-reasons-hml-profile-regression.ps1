$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $repositoryRoot "installer\AndonInstaller.Common.ps1")

function Assert-ReasonsHml([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw "REFINE22 P1 call reasons validation: $Message" }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("andon-reasons-hml-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path (Join-Path $testRoot "server") -Force | Out-Null
try {
    $config = Get-AndonDefaultConfig
    $config.projectPath = $testRoot
    $config.transportMode = "https"
    $config.httpsHost = "127.0.0.1"
    $config.postgresHost = "127.0.0.1"
    $config.centralAccessEnabled = $true
    $config.centralSecurityValidationEnabled = $false
    $network = [pscustomobject]@{
        corsOrigins = "https://127.0.0.1:8080"
        frontendUrl = "https://127.0.0.1:8080"
    }
    $envPath = Join-Path $testRoot "server\.env"
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    $off = Get-Content -LiteralPath $envPath -Raw
    Assert-ReasonsHml ($off -match '(?m)^ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=0\r?$') "catalog must remain OFF outside security validation"
    Assert-ReasonsHml ($off -match '(?m)^ANDON_HIERARCHICAL_CALL_OPEN_ENABLED=0\r?$') "operational opening must remain OFF"

    $config.centralSecurityValidationEnabled = $true
    Write-AndonBackendEnv -Config $config -NetworkConfig $network
    $on = Get-Content -LiteralPath $envPath -Raw
    Assert-ReasonsHml ($on -match '(?m)^ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=1\r?$') "catalog should be ON with explicit notebook validation"
    Assert-ReasonsHml ($on -match '(?m)^ANDON_HIERARCHICAL_CALL_OPEN_ENABLED=0\r?$') "catalog approval must not activate machine call opening"
    Assert-ReasonsHml ($on -match '(?m)^ANDON_CENTRAL_ACCESS_ENABLED=1\r?$') "central login must remain enabled"
    Assert-ReasonsHml ($on -match '(?m)^ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED=1\r?$') "sector editor remains independently gated"

    foreach ($invalid in @(
        @{ transportMode = "http"; postgresHost = "127.0.0.1"; centralAccessEnabled = $true },
        @{ transportMode = "https"; postgresHost = "192.0.2.25"; centralAccessEnabled = $true },
        @{ transportMode = "https"; postgresHost = "127.0.0.1"; centralAccessEnabled = $false }
    )) {
        $config.transportMode = $invalid.transportMode
        $config.postgresHost = $invalid.postgresHost
        $config.centralAccessEnabled = $invalid.centralAccessEnabled
        $failed = $false
        try {
            Write-AndonBackendEnv -Config $config -NetworkConfig $network
        } catch { $failed = $true }
        Assert-ReasonsHml $failed "HTTP, remote PG and noncentral sessions must refuse notebook profile"
        Assert-ReasonsHml ((Get-Content -LiteralPath $envPath -Raw) -eq $on) "rejected profile must leave previous env intact"
    }
    Write-Host "REFINE22 P1: guarded reasons catalog ON, operational opening OFF, rollback preflight PASS"
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
