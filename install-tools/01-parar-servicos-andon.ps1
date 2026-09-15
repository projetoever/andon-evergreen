$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$ChromeProfilePath = "$ProjectPath\chrome-profile"
$AndonNodePath = "$BasePath\runtime\node\node.exe"

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

Write-Host "Parando somente processos Node pertencentes ao ANDON..."

function Test-AndonNodeProcessOwned {
  param(
    [string]$ExecutablePath,
    [string]$CommandLine
  )

  if (
    [string]::IsNullOrWhiteSpace($ExecutablePath) -or
    [string]::IsNullOrWhiteSpace($CommandLine)
  ) {
    return $false
  }

  $normalizedExecutablePath = $ExecutablePath.Replace("/", "\").ToLowerInvariant()
  $normalizedCommandLine = $CommandLine.Replace("/", "\").ToLowerInvariant()
  $normalizedProjectPath = $ProjectPath.Replace("/", "\").TrimEnd("\").ToLowerInvariant()
  $normalizedAndonNodePath = $AndonNodePath.Replace("/", "\").ToLowerInvariant()
  $apiMarker = "$normalizedProjectPath\server\dist\server.js"
  $hasApiMarker = $normalizedCommandLine.Contains($apiMarker)
  $hasProjectMarker = $normalizedCommandLine.Contains("$normalizedProjectPath\")
  $hasViteEntrypoint =
    $normalizedCommandLine.Contains("\vite\bin\vite.js") -or
    $normalizedCommandLine.Contains("\vite\dist\node\cli.js")
  $hasFrontendMarker =
    $hasProjectMarker -and
    $normalizedCommandLine.Contains("\node_modules\") -and
    $hasViteEntrypoint -and
    $normalizedCommandLine -match '(^|\s)preview(\s|$)'

  if (!$hasApiMarker -and !$hasFrontendMarker) {
    return $false
  }

  if ($normalizedExecutablePath -eq $normalizedAndonNodePath) {
    return $true
  }

  return $hasProjectMarker
}

$andonNodeProcesses = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    Test-AndonNodeProcessOwned `
      -ExecutablePath "$($_.ExecutablePath)" `
      -CommandLine "$($_.CommandLine)"
  }

foreach ($proc in $andonNodeProcesses) {
    Write-Host "Finalizando Node ANDON PID $($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "Verificando portas 3001 e 8080..."

$portPids = Get-NetTCPConnection -LocalPort 3001,8080 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -gt 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidItem in $portPids) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidItem" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -like "*$ProjectPath*") {
        Write-Host "Finalizando processo ANDON na porta 3001/8080. PID: $pidItem - Processo: $($process.Name)"
        Stop-Process -Id $pidItem -Force -ErrorAction SilentlyContinue
    } elseif ($process) {
        Write-Host "Processo externo preservado na porta 3001/8080. PID: $pidItem - Processo: $($process.Name)"
    }
}

Write-Host "===== SERVICOS ANDON PARADOS ====="
