$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\configure-andon-central-hml.ps1'
if (!(Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw 'SEC17: configurador ausente.' }

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath, [ref]$tokens, [ref]$parseErrors
)
if (@($parseErrors).Count -gt 0) {
    throw ('SEC17: PowerShell parser falhou: ' + (@($parseErrors) | ForEach-Object Message) -join '; ')
}
$source = Get-Content -LiteralPath $scriptPath -Raw
foreach ($marker in @(
    "ValidateSet('Check', 'Enable', 'Restore')",
    'ProductType -ne 1',
    "'andon_https_hml'",
    '55432',
    "'andon-postgres'",
    "'andon-postgres-data'",
    '127.0.0.1',
    'Get-NetTCPConnection -State Listen',
    'Get-FileHash',
    'pg_dump',
    'pg_restore -l',
    'icacls.exe',
    '[IO.File]::Replace',
    'ConfirmIsolated',
    'installedCommit',
    'Set-Refine8ConfigAtomically'
)) {
    if (!$source.Contains($marker)) { throw "SEC17: protecao obrigatoria ausente: $marker" }
}
foreach ($forbidden in @(
    'Start-AndonRuntime',
    'Stop-AndonRuntime',
    'RemoveData',
    'docker.exe rm -f',
    'git.exe reset --hard'
)) {
    if ($source.Contains($forbidden)) { throw "SEC17: acao operacional nao autorizada: $forbidden" }
}

# Negative execution test: a deliberate alternate config file must be rejected before
# Docker backup, changes to the runtime or any central activation. No host writes.
$fakeConfig = Join-Path $env:TEMP ('refine8-sec17-fake-' + [guid]::NewGuid().ToString('N') + '.json')
try {
    $sample = @{
        databaseMode = 'docker'; databaseName = 'andon_db'
        postgresHost = '127.0.0.1'; postgresPort = 5432
        dockerContainer = 'andon-postgres'; dockerVolume = 'andon-postgres-data'
        transportMode = 'https'; httpsHost = 'localhost'
        tlsCertificatePath = 'nonexistent.pem'; tlsPrivateKeyPath = 'nonexistent.key'
        projectPath = 'C:\web-andon-industrial\andon'
        installedCommit = ('a' * 40); centralAccessEnabled = $false
    } | ConvertTo-Json
    [IO.File]::WriteAllText($fakeConfig, $sample)
    $before = (Get-FileHash -LiteralPath $fakeConfig -Algorithm SHA256).Hash
    # GitHub Actions runs on Windows Server: rejecting the host is the expected
    # fail-closed result. Treat child-process stderr as data, not a test failure.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Action Enable -ConfirmIsolated -ConfigPath $fakeConfig 2>&1
        $negativeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($negativeExitCode -eq 0) { throw 'SEC17: aceitou configuracao nao oficial.' }
    $after = (Get-FileHash -LiteralPath $fakeConfig -Algorithm SHA256).Hash
    if ($before -ne $after) { throw 'SEC17: tocou configuracao indevida.' }
} finally {
    if (Test-Path -LiteralPath $fakeConfig) { Remove-Item -LiteralPath $fakeConfig -Force }
}
Write-Host 'SEC17 PASS: parse, guardas estaticas e recusa read-only em PowerShell 5.1.' -ForegroundColor Green
# Clear the intentional nonzero exit from the negative child process for CI.
$global:LASTEXITCODE = 0
