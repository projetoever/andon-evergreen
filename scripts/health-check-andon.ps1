$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ChromeProfilePath = "$ProjectPath\chrome-profile"

Write-Host "===== ANDON - HEALTH CHECK ====="

Write-Host ""
Write-Host "0. Conferindo arquivos de build..."

$ApiBuild = "$ProjectPath\server\dist\server.js"
$FrontBuild = "$ProjectPath\dist"

if (Test-Path $ApiBuild) {
    Write-Host "Build API OK: $ApiBuild"
} else {
    Write-Host "ERRO: Build da API nao encontrado: $ApiBuild"
    Write-Host "Execute: cd C:\web-andon-industrial\andon\server ; npm.cmd run build"
}

if (Test-Path $FrontBuild) {
    Write-Host "Build frontend OK: $FrontBuild"
} else {
    Write-Host "ERRO: Build frontend nao encontrado: $FrontBuild"
    Write-Host "Execute: cd C:\web-andon-industrial\andon ; npm.cmd run build"
}

Write-Host ""
Write-Host "1. API /health"
try {
    Invoke-RestMethod http://localhost:3001/health -TimeoutSec 5
    Write-Host "API OK"
} catch {
    Write-Host "ERRO: API nao respondeu."
}

Write-Host ""
Write-Host "2. Banco /health/db"
try {
    Invoke-RestMethod http://localhost:3001/health/db -TimeoutSec 5
    Write-Host "Banco OK"
} catch {
    Write-Host "ERRO: Banco/API nao respondeu."
}

Write-Host ""
Write-Host "3. Frontend"
try {
    Invoke-WebRequest http://127.0.0.1:8080 -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host "Frontend OK"
} catch {
    Write-Host "ERRO: Frontend nao respondeu."
}

Write-Host ""
Write-Host "4. Portas"
Write-Host "Porta 3001:"
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Format-Table -AutoSize

Write-Host "Porta 8080:"
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Format-Table -AutoSize

Write-Host ""
Write-Host "5. Processos Node"
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize

Write-Host ""
Write-Host "6. Chrome associado ao ANDON"
Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$ChromeProfilePath*" } |
    Select-Object ProcessId, CommandLine |
    Format-List

Write-Host ""
Write-Host "7. Tarefas ANDON"
schtasks /Query | findstr ANDON

Write-Host ""
Write-Host "===== HEALTH CHECK FINALIZADO ====="
