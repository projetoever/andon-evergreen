$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"

Write-Host "===== ANDON - RECRIAR TAREFAS AUTOMATICAS ====="

schtasks /Delete /TN "ANDON - Inicializacao Automatica" /F 2>$null
schtasks /Delete /TN "ANDON - Boot Servicos" /F 2>$null
schtasks /Delete /TN "ANDON - Watchdog Servicos" /F 2>$null
schtasks /Delete /TN "ANDON - Chrome Kiosk" /F 2>$null

schtasks /Create /TN "ANDON - Boot Servicos" /SC ONSTART /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"C:\web-andon-industrial\andon\scripts\watchdog-andon.ps1`""

schtasks /Create /TN "ANDON - Watchdog Servicos" /SC MINUTE /MO 1 /RU SYSTEM /RL HIGHEST /F /TR "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"C:\web-andon-industrial\andon\scripts\watchdog-andon.ps1`""

schtasks /Create /TN "ANDON - Chrome Kiosk" /SC ONLOGON /RU Administrator /RL HIGHEST /IT /F /TR "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"C:\web-andon-industrial\andon\scripts\open-kiosk-chrome.ps1`""

schtasks /Query | findstr ANDON

Write-Host "===== TAREFAS AUTOMATICAS RECRIADAS ====="
