$InstallerScript = "C:\web-andon-industrial\installer\uninstall-andon-clean.ps1"

Write-Host "===== ANDON - DESINSTALACAO LIMPA ====="

if (!(Test-Path $InstallerScript)) {
    Write-Host "ERRO: script do instalador nao encontrado:"
    Write-Host $InstallerScript
    exit 1
}

powershell.exe -ExecutionPolicy Bypass -NoProfile -File $InstallerScript

exit $LASTEXITCODE
