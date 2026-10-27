$ErrorActionPreference = "Stop"
$errors = @()
$tokens = $null
$scripts = @(
    (Join-Path $PSScriptRoot "Start-AndonHttpsHomologation.ps1"),
    (Join-Path $PSScriptRoot "Stop-AndonHttpsHomologation.ps1")
)

foreach ($script in $scripts) {
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $script,
        [ref]$tokens,
        [ref]$errors
    )
}

if ($errors.Count -gt 0) {
    throw ($errors | ForEach-Object { $_.Message } | Out-String)
}

$start = Get-Content $scripts[0] -Raw
foreach ($required in @(
    'ANDON_CENTRAL_ACCESS_ENABLED = "1"',
    'ANDON_ACCESS_ORIGIN = $origin',
    'CORS_ORIGINS = $origin',
    'ANDON_TLS_CERT = $certPath',
    'ANDON_TLS_KEY = $keyPath',
    '127.0.0.1:${PostgresPort}:5432',
    'mkcert.exe -install',
    'if ($seedRequired)',
    'Add-Member -NotePropertyName "initialized" -NotePropertyValue $true -Force'
)) {
    if (!$start.Contains($required)) { throw "Controle ausente no launcher: $required" }
}

$stop = Get-Content $scripts[1] -Raw
if (!$stop.Contains('Docker nao encontrado. Os dados e as credenciais locais foram preservados.')) {
    throw "A remocao deve preservar credenciais quando o Docker estiver indisponivel."
}

if ($start -match 'NODE_TLS_REJECT_UNAUTHORIZED|ignoreHTTPSErrors|rejectUnauthorized') {
    throw "O launcher nao pode desabilitar a validacao TLS."
}

Write-Host "Scripts HTTPS de homologacao: sintaxe e controles basicos aprovados."
