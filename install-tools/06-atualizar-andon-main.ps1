$InstallerScript = "C:\web-andon-industrial\installer\update-andon-server.ps1"

Write-Host "===== ANDON - ATUALIZAR PELA MAIN ====="
Write-Host "Encaminhando para o atualizador seguro do instalador."
Write-Host ""

if (!(Test-Path $InstallerScript)) {
    Write-Host "ERRO: script do instalador nao encontrado:"
    Write-Host $InstallerScript
    exit 1
}

powershell.exe -ExecutionPolicy Bypass -NoProfile -File $InstallerScript

exit $LASTEXITCODE
