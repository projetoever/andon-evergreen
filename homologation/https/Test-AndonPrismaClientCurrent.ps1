# PowerShell 5.1 / Prisma 6: reuse a generated client only when its
# stored schema is byte-for-byte equivalent to the authoritative schema.
# On Windows the engine DLL is locked by any running Node process loading it.
# A redundant prisma generate causes EPERM even when no migration is needed.
function Test-AndonPrismaClientCurrent {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $schema = Join-Path $ServerRoot "prisma\schema.prisma"
    $generatedRoot = Join-Path $ServerRoot "node_modules\.prisma\client"
    $generatedSchema = Join-Path $generatedRoot "schema.prisma"
    $generatedRuntime = Join-Path $generatedRoot "index.js"
    $engine = Join-Path $generatedRoot "query_engine-windows.dll.node"
    $package = Join-Path $generatedRoot "package.json"

    foreach ($required in @($schema, $generatedSchema, $generatedRuntime, $engine, $package)) {
        if (!(Test-Path $required -PathType Leaf)) { return $false }
        if ((Get-Item $required).Length -eq 0) { return $false }
    }
    try {
        # Read-only checks: never rename or replace a loaded engine DLL.
        $expected = (Get-FileHash -Path $schema -Algorithm SHA256 -ErrorAction Stop).Hash
        $actual = (Get-FileHash -Path $generatedSchema -Algorithm SHA256 -ErrorAction Stop).Hash
        if ($expected -ne $actual) { return $false }
        $clientMetadata = Get-Content $package -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$clientMetadata.version)) { return $false }
        return $true
    } catch {
        return $false
    }
}
