$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..")).TrimEnd('\')
$legacyRoot = 'C:\web-andon-industrial\andon'
$path = Join-Path $root "ATUALIZAR_NOTEBOOK.ps1"
if (!$root.Equals($legacyRoot, [StringComparison]::OrdinalIgnoreCase)) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $path, [ref]$tokens, [ref]$errors)
    if (@($errors).Count -gt 0) { throw "Legacy updater PowerShell parse error." }
    $src = Get-Content -LiteralPath $path -Raw
    foreach ($required in @(
        "$legacyRoot = 'C:\web-andon-industrial\andon'",
        "'ATUALIZAR_NOTEBOOK.ps1 e rotina LEGADA",
        'Get-Item -LiteralPath $repoRoot -Force',
        '$canonicalRoot.Equals($legacyRoot, [System.StringComparison]::OrdinalIgnoreCase)'
    )) {
        if (!$src.Contains($required)) { throw "Missing LAB fail-closed guard: $required" }
    }
    $blocked = $false
    try {
        # CI runner is not the industrial path. This MUST fail before Git, Docker,
        # installer staging, file writes, or process stop; no mocks required.
        & $path -SemGitPull
    } catch {
        if ($_.Exception.Message -notmatch 'NUNCA execute na HML') { throw }
        $blocked = $true
    }
    if (!$blocked) { throw "The legacy updater accepted a non-industrial checkout." }
    Write-Host "Legacy updater rejected non-industrial checkout before side effects." -ForegroundColor Green
} else {
    # Absolutely refuse an integration test that could run in the real original.
    throw "Safety test must never execute from the industrial installation."
}
