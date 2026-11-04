[CmdletBinding()]
param([switch]$RemoveData)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$statePath = Join-Path $repoRoot ".andon-homologation"
$processPath = Join-Path $statePath "processes.json"
$containerName = "andon-https-hml-postgres"
. (Join-Path $PSScriptRoot "Test-AndonHttpsDockerContainerExists.ps1")
. (Join-Path $PSScriptRoot "Stop-AndonHttpsTrackedProcess.ps1")

if (Test-Path $processPath) {
    $processes = Get-Content $processPath -Raw | ConvertFrom-Json
    $startedAtUtc = [datetime]::Parse(
        [string]$processes.startedAt,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::RoundtripKind
    )
    foreach ($processId in @($processes.frontendPid, $processes.apiPid)) {
        if ($processId) {
            Stop-AndonHttpsTrackedProcess -ProcessId ([int]$processId) -StartedAtUtc $startedAtUtc
        }
    }
    # Delete only the stale process metadata. The PostgreSQL test volume,
    # its credentials and the notebook test-profile marker are preserved.
    Remove-Item $processPath -Force
}

if ($RemoveData -and !(Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw "Docker nao encontrado. Os dados e as credenciais locais foram preservados."
}

if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
    $containerExists = Test-AndonHttpsDockerContainerExists -ContainerName $containerName
    if ($containerExists) {
        & docker.exe stop $containerName | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Nao foi possivel encerrar o container de homologacao. Os dados foram preservados."
        }
    }
    if ($RemoveData) {
        if ($containerExists) {
            & docker.exe rm -f $containerName | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao remover o container. Os dados e as credenciais locais foram preservados."
            }
        }
        if (Test-AndonHttpsDockerContainerExists -ContainerName $containerName) {
            throw "O container ainda existe. Os dados e as credenciais locais foram preservados."
        }
    }
}

if ($RemoveData -and (Test-Path $statePath)) {
    Remove-Item $statePath -Recurse -Force
    Write-Host "Dados, certificado e credenciais locais de homologacao removidos." -ForegroundColor Yellow
} else {
    Write-Host "Homologacao encerrada. Banco isolado preservado para o proximo teste." -ForegroundColor Green
}
