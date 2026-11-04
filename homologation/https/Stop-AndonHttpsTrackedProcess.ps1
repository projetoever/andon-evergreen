# Stop only a launcher process recorded by the HTTPS test profile.
# PIDs may expire or be reused between two updates; never kill an unrelated app.
function Stop-AndonHttpsTrackedProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][datetime]$StartedAtUtc
    )

    if ($ProcessId -le 0) { return }

    $running = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    if ($null -eq $running) {
        Write-Host "Processo anterior $ProcessId ja encerrado; continuando."
        return
    }

    $command = [string]$running.CommandLine
    $isLauncher = (
        ([string]$running.Name -ieq "cmd.exe" -and $command -match '(?i)npm(?:\.cmd)?"?\s+run\s+dev') -or
        ([string]$running.Name -ieq "node.exe" -and $command -match '(?i)npm-cli\.js"?\s+run\s+dev\b')
    )

    $createdUtc = ([datetime]$running.CreationDate).ToUniversalTime()
    $startUtc = $StartedAtUtc.ToUniversalTime()
    # startedAt is written immediately AFTER Start-Process returns.
    # A reused PID from another invocation must never be killed.
    $isSameLaunch = (
        $createdUtc -ge $startUtc.AddMinutes(-5) -and
        $createdUtc -le $startUtc.AddSeconds(30)
    )
    if (!$isLauncher -or !$isSameLaunch) {
        Write-Warning "PID $ProcessId nao corresponde ao launcher desta homologacao. Nenhum processo externo sera encerrado."
        return
    }

    # PowerShell 5.1 turns taskkill's ordinary 'PID not found' stderr into a
    # terminating NativeCommandError when ErrorActionPreference is Stop.
    # A PID can disappear after the CIM preflight; treat that race as success.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & taskkill.exe /PID $ProcessId /T /F 1>$null 2>$null
        $taskkillExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }

    if ($taskkillExit -ne 0) {
        $remaining = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
        if ($null -ne $remaining -and
            ([datetime]$remaining.CreationDate).ToUniversalTime() -eq $createdUtc) {
            throw "Nao foi possivel encerrar o processo de homologacao $ProcessId. Nada mais sera encerrado."
        }
    }
}
