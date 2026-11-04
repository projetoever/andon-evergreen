$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Stop-AndonHttpsTrackedProcess.ps1")

# No PID is ever taken from this machine. All OS and taskkill calls are mocked.
$script:queried = 0
$script:kills = 0
$script:beforeKill = $null
$script:afterKill = $null
$script:exitCode = 0
$base = [datetime]::UtcNow
$owned = [pscustomobject]@{
    Name = "cmd.exe"
    CommandLine = 'C:\Windows\system32\cmd.exe /c ""C:\Program Files\nodejs\npm.cmd" run dev"'
    CreationDate = $base.AddSeconds(-2)
}
$foreign = [pscustomobject]@{
    Name = "notepad.exe"
    CommandLine = "notepad.exe"
    CreationDate = $base.AddSeconds(-2)
}
$reused = [pscustomobject]@{
    Name = "cmd.exe"
    CommandLine = $owned.CommandLine
    CreationDate = $base.AddMinutes(10)
}

function Get-CimInstance {
    [CmdletBinding()]
    param([string]$ClassName, [string]$Filter)
    if ($ClassName -ne "Win32_Process" -or $Filter -ne "ProcessId = 24488") {
        throw "A consulta saiu do PID ficticio."
    }
    $script:queried += 1
    if ($script:queried -gt 1) { return $script:afterKill }
    return $script:beforeKill
}
function taskkill.exe {
    $script:kills += 1
    $global:LASTEXITCODE = $script:exitCode
}

$oldNativeExit = $global:LASTEXITCODE
try {
    $script:queried = 0
    $script:beforeKill = $null
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    if ($script:kills -ne 0) { throw "PID ausente invocou taskkill." }

    $script:queried = 0
    $script:beforeKill = $foreign
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    if ($script:kills -ne 0) { throw "PID de outra aplicacao foi encerrado." }

    $script:queried = 0
    $script:beforeKill = $reused
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    if ($script:kills -ne 0) { throw "PID reutilizado foi encerrado." }

    $script:queried = 0
    $script:beforeKill = $owned
    $script:exitCode = 0
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    if ($script:kills -ne 1) { throw "Launcher valido nao recebeu taskkill." }

    # Compiled Node processes started by menu option 4 are also stoppable,
    # but only when their absolute entrypoint belongs to this Git project.
    $compiled = [pscustomobject]@{
        Name = "node.exe"
        CommandLine = '"C:\Program Files\nodejs\node.exe" "C:\web-andon-industrial\andon\server\dist\server.js"'
        CreationDate = $base.AddSeconds(-2)
    }
    $otherNode = [pscustomobject]@{
        Name = "node.exe"
        CommandLine = '"C:\Program Files\nodejs\node.exe" "C:\other-service\server\dist\server.js"'
        CreationDate = $base.AddSeconds(-2)
    }
    $script:queried = 0
    $script:beforeKill = $otherNode
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base -ProjectRoot 'C:\web-andon-industrial\andon'
    if ($script:kills -ne 1) { throw "Processo Node externo foi encerrado." }

    $script:queried = 0
    $script:beforeKill = $compiled
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base -ProjectRoot 'C:\web-andon-industrial\andon'
    if ($script:kills -ne 2) { throw "Processo Node compilado do ANDON nao foi encerrado." }

    $script:queried = 0
    $script:beforeKill = $owned
    $script:afterKill = $null
    $script:exitCode = 128
    Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    if ($script:kills -ne 3) { throw "Corrida de finalizacao nao foi testada." }

    $script:queried = 0
    $script:beforeKill = $owned
    $script:afterKill = $owned
    $script:exitCode = 5
    $blocked = $false
    try {
        Stop-AndonHttpsTrackedProcess -ProcessId 24488 -StartedAtUtc $base
    } catch {
        if ($_.Exception.Message -notmatch "Nao foi possivel encerrar") { throw }
        $blocked = $true
    }
    if (!$blocked) { throw "Falha real em processo ativo nao pode ser ignorada." }
} finally {
    $global:LASTEXITCODE = $oldNativeExit
    Remove-Item Function:\Get-CimInstance -ErrorAction SilentlyContinue
    Remove-Item Function:\taskkill.exe -ErrorAction SilentlyContinue
}
Write-Host "Hotfix HTTPS: PID ausente, reutilizado, corrida e falha real testados." -ForegroundColor Green
