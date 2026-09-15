$ErrorActionPreference = "Stop"

# Compatibilidade segura: impede que o instalador V10.5.1 sobrescreva o fluxo atual.
$currentBootstrap = Join-Path $PSScriptRoot "INSTALAR_ANDON_SERVIDOR.ps1"

Write-Host "[AVISO] O aplicador V10.5.1 esta obsoleto." -ForegroundColor Yellow
Write-Host "Encaminhando para o Bootstrap 3.0 oficial."

if (!(Test-Path $currentBootstrap -PathType Leaf)) {
    Write-Host "[FALHA] Bootstrap 3.0 nao encontrado: $currentBootstrap" -ForegroundColor Red
    Write-Host "O instalador antigo nao sera aplicado. Obtenha a versao atual do repositorio oficial."
    exit 1
}

powershell.exe -ExecutionPolicy Bypass -NoProfile -File $currentBootstrap
exit $LASTEXITCODE
