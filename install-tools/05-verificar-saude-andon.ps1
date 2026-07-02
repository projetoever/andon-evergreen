$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"

Write-Host "===== ANDON - VERIFICAR SAUDE ====="

$HealthScript = "$ProjectPath\scripts\health-check-andon.ps1"

if (Test-Path $HealthScript) {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File $HealthScript
} else {
    Write-Host "ERRO: health-check-andon.ps1 nao encontrado em:"
    Write-Host $HealthScript
    exit 1
}

Write-Host "===== VERIFICACAO FINALIZADA ====="
