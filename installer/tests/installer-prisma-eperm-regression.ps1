$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
. (Join-Path $root "installer\AndonInstaller.Common.ps1")

function Assert-PrismaTest {
    param([bool]$Condition, [string]$Message)
    if (!$Condition) { throw "Prisma DLL regression failed: $Message" }
}

$fixture = Join-Path $env:TEMP ("andon-prisma-eperm-" + [guid]::NewGuid().ToString("N"))
$schemaDir = Join-Path $fixture "prisma"
$generatedDir = Join-Path $fixture "node_modules\.prisma\client"
$prismaDir = Join-Path $fixture "node_modules\prisma"
$clientDir = Join-Path $fixture "node_modules\@prisma\client"
foreach ($folder in @($schemaDir, $generatedDir, $prismaDir, $clientDir)) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
$sourcePath = Join-Path $schemaDir "schema.prisma"
$generatedPath = Join-Path $generatedDir "schema.prisma"
$enginePath = Join-Path $generatedDir "query_engine-windows.dll.node"
$originalGenerate = (Get-Item Function:\Invoke-AndonNodeProcess).ScriptBlock
$originalEngineOwners = (Get-Item Function:\Stop-AndonPrismaEngineNodeOwners).ScriptBlock

try {
    Set-Content -LiteralPath $sourcePath -Value 'model Machine { id String @id }'
    Set-Content -LiteralPath $generatedPath -Value 'model Machine { id String @id }'
    Set-Content -LiteralPath (Join-Path $prismaDir "package.json") -Value '{"version":"6.19.3"}'
    Set-Content -LiteralPath (Join-Path $clientDir "package.json") -Value '{"version":"6.19.3"}'
    Set-Content -LiteralPath (Join-Path $clientDir "default.js") -Value 'module.exports = {};'
    Set-Content -LiteralPath (Join-Path $generatedDir "index.js") -Value 'module.exports = {};'
    Set-Content -LiteralPath $enginePath -Value 'simulated engine'

    Assert-PrismaTest (Test-AndonPrismaClientReusable -ServerPath $fixture) "Complete client with matching versions/schema must skip generate"

    $script:attempts = 0
    $script:engineChecks = 0
    Set-Item Function:\Invoke-AndonNodeProcess -Value {
        $script:attempts++
        throw "Generator must NOT execute when client is current"
    }
    Set-Item Function:\Stop-AndonPrismaEngineNodeOwners -Value {
        $script:engineChecks++
        throw "Do not stop any process when client is current"
    }
    Invoke-AndonPrismaClientEnsure -ServerPath $fixture -NpmPath "mock-npm.cmd"
    Assert-PrismaTest ($script:attempts -eq 0 -and $script:engineChecks -eq 0) "Current client must not rename or load the Windows DLL"

    Set-Content -LiteralPath $sourcePath -Value 'model Machine { id String @id; name String }'
    Assert-PrismaTest (!(Test-AndonPrismaClientReusable -ServerPath $fixture)) "Changed Prisma schema requires regeneration"
    $script:attempts = 0
    $script:engineChecks = 0
    Set-Item Function:\Stop-AndonPrismaEngineNodeOwners -Value {
        $script:engineChecks++
    }
    Set-Item Function:\Invoke-AndonNodeProcess -Value {
        $script:attempts++
        if ($script:attempts -eq 1) {
            throw "EPERM: operation not permitted, rename query_engine-windows.dll.node.tmp"
        }
        Copy-Item -LiteralPath $sourcePath -Destination $generatedPath -Force
    }
    Invoke-AndonPrismaClientEnsure -ServerPath $fixture -NpmPath "mock-npm.cmd"
    Assert-PrismaTest ($script:attempts -eq 2 -and $script:engineChecks -eq 2) "Transient DLL EPERM must retry and validate generation"
    Assert-PrismaTest (Test-AndonPrismaClientReusable -ServerPath $fixture) "Recovered client must match exact current schema"

    Set-Content -LiteralPath (Join-Path $clientDir "package.json") -Value '{"version":"6.19.2"}'
    Assert-PrismaTest (!(Test-AndonPrismaClientReusable -ServerPath $fixture)) "Version mismatch must deny client reuse"
    Set-Content -LiteralPath (Join-Path $clientDir "package.json") -Value '{"version":"6.19.3"}'
    Remove-Item -LiteralPath $enginePath
    Assert-PrismaTest (!(Test-AndonPrismaClientReusable -ServerPath $fixture)) "Missing DLL must deny client reuse"
} finally {
    Set-Item Function:\Invoke-AndonNodeProcess -Value $originalGenerate
    Set-Item Function:\Stop-AndonPrismaEngineNodeOwners -Value $originalEngineOwners
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
}

$common = Get-Content (Join-Path $root "installer\AndonInstaller.Common.ps1") -Raw
$update = Get-Content (Join-Path $root "installer\update-andon-server.ps1") -Raw
Assert-PrismaTest (
    $common.Contains("Invoke-AndonPrismaClientEnsure -ServerPath") -and
    !$common.Contains('Invoke-AndonNodeProcess $npm @("run", "db:generate") $serverPath')
) "Installer must use the safe generate/reuse helper"
Assert-PrismaTest (
    $common.Contains('Get-Process -Id $process.ProcessId -Module') -and
    $common.Contains('$_.FileName.Replace("/", "\").ToLowerInvariant() -eq $expected')
) "Process cleanup must verify exact engine DLL path"
Assert-PrismaTest (
    $update.Contains('$script:AndonPreviousTaskStates') -and
    $update.Contains('Start-AndonRuntime') -and
    $update.Contains('if ($taskInfo.WasDisabled)')
) "Update failures must restore availability and prior boot task states"

Write-Host "Prisma DLL Windows: safe reuse, transient EPERM, schema change and recovery validated." -ForegroundColor Green
