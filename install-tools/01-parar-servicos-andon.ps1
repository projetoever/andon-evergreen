$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ChromeProfilePath = "$ProjectPath\chrome-profile"

Write-Host "===== ANDON - PARAR SERVICOS ====="

$tasks = @(
  "ANDON - Boot Servicos",
  "ANDON - Watchdog Servicos",
  "ANDON - Chrome Kiosk"
)

foreach ($task in $tasks) {
    Write-Host "Tentando finalizar tarefa: $task"
    schtasks /End /TN $task 2>$null

    Write-Host "Tentando desativar tarefa: $task"
    schtasks /Change /TN $task /DISABLE 2>$null
}

Write-Host "Parando Chrome associado ao perfil ANDON..."

$andonChromeProcesses = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*chrome-profile*" -or $_.CommandLine -like "*$ChromeProfilePath*" }

foreach ($proc in $andonChromeProcesses) {
    Write-Host "Finalizando Chrome ANDON PID $($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Parando processos Node..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Verificando portas 3001 e 8080..."

$portPids = Get-NetTCPConnection -LocalPort 3001,8080 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    $process = Get-Process -Id $pidItem -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Finalizando processo na porta 3001/8080. PID: $pidItem - Processo: $($process.ProcessName)"
        Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "===== SERVICOS ANDON PARADOS ====="
