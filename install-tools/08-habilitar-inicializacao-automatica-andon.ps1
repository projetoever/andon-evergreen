Write-Host "===== ANDON - HABILITAR INICIALIZACAO AUTOMATICA ====="

$tasks = @(
  "ANDON - Boot Servicos",
  "ANDON - Watchdog Servicos",
  "ANDON - Chrome Kiosk"
)

foreach ($task in $tasks) {
    Write-Host "Habilitando tarefa: $task"
    schtasks /Change /TN $task /ENABLE 2>$null
}

schtasks /Query | findstr ANDON

Write-Host "===== INICIALIZACAO AUTOMATICA HABILITADA ====="
