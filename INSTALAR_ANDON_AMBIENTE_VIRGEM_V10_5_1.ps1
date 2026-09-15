$ErrorActionPreference = "Stop"

# Compatibilidade segura: o pacote V10.5.1 foi substituido pelo Bootstrap 3.0.
$currentBootstrap = Join-Path $PSScriptRoot "INSTALAR_ANDON_SERVIDOR.ps1"

Write-Host "[AVISO] O bootstrap V10.5.1 esta obsoleto." -ForegroundColor Yellow
Write-Host "Use o Bootstrap 3.0, que instala o Node dedicado e protege o PostgreSQL corporativo."

if (!(Test-Path $currentBootstrap -PathType Leaf)) {
    Write-Host "[FALHA] Bootstrap 3.0 nao encontrado: $currentBootstrap" -ForegroundColor Red
    Write-Host "Obtenha a versao atual do repositorio oficial antes de continuar."
    exit 1
}

powershell.exe -ExecutionPolicy Bypass -NoProfile -File $currentBootstrap
exit $LASTEXITCODE
