Write-Host "===== ANDON - DESATIVAR INICIALIZACAO AUTOMATICA ====="

$tasks = @(
  "ANDON - Boot Servicos",
  "ANDON - Watchdog Servicos",
  "ANDON - Chrome Kiosk"
)

foreach ($task in $tasks) {
    Write-Host "Desativando tarefa: $task"
    schtasks /Change /TN $task /DISABLE 2>$null
}

schtasks /Query | findstr ANDON

Write-Host "===== INICIALIZACAO AUTOMATICA DESATIVADA ====="
