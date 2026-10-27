[CmdletBinding()]
param([switch]$RemoveData)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$statePath = Join-Path $repoRoot ".andon-homologation"
$processPath = Join-Path $statePath "processes.json"
$containerName = "andon-https-hml-postgres"

if (Test-Path $processPath) {
    $processes = Get-Content $processPath -Raw | ConvertFrom-Json
    foreach ($processId in @($processes.frontendPid, $processes.apiPid)) {
        if ($processId) {
            & taskkill.exe /PID ([int]$processId) /T /F 1>$null 2>$null
        }
    }
    Remove-Item $processPath -Force
}

if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
    & docker.exe stop $containerName 1>$null 2>$null
    if ($RemoveData) {
        & docker.exe rm -f $containerName 1>$null 2>$null
    }
}

if ($RemoveData -and (Test-Path $statePath)) {
    Remove-Item $statePath -Recurse -Force
    Write-Host "Dados, certificado e credenciais locais de homologacao removidos." -ForegroundColor Yellow
} else {
    Write-Host "Homologacao encerrada. Banco isolado preservado para o proximo teste." -ForegroundColor Green
}
