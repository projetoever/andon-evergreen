$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ToolsPath = "$BasePath\andon-tools"

Write-Host "===== ANDON - INICIAR SERVICOS ====="

$requiredTasks = @(
  "ANDON - Boot Servicos",
  "ANDON - Watchdog Servicos",
  "ANDON - Chrome Kiosk"
)

$missingTask = $false

foreach ($task in $requiredTasks) {
    schtasks /Query /TN $task 1>$null 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tarefa ausente: $task"
        $missingTask = $true
    }
}

if ($missingTask) {
    Write-Host "Uma ou mais tarefas nao existem. Recriando tarefas automaticas..."

    if (Test-Path "$ToolsPath\09-recriar-tarefas-automaticas-andon.ps1") {
        powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\09-recriar-tarefas-automaticas-andon.ps1"
    } else {
        Write-Host "ERRO: Script 09 nao encontrado em $ToolsPath"
        exit 1
    }
}

foreach ($task in $requiredTasks) {
    Write-Host "Reativando tarefa: $task"
    schtasks /Change /TN $task /ENABLE
}

Write-Host "Executando watchdog..."
schtasks /Run /TN "ANDON - Watchdog Servicos"

Start-Sleep -Seconds 12

Write-Host "Executando Chrome Kiosk..."
schtasks /Run /TN "ANDON - Chrome Kiosk"

Start-Sleep -Seconds 5

if (Test-Path "$ToolsPath\05-verificar-saude-andon.ps1") {
    powershell.exe -ExecutionPolicy Bypass -NoProfile -File "$ToolsPath\05-verificar-saude-andon.ps1"
}

Write-Host "===== ANDON - INICIALIZACAO SOLICITADA ====="
