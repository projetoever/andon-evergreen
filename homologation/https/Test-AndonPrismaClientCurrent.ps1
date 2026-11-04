# Prisma 6 / Windows PowerShell 5.1
# Do not compare the raw schema to Prisma's generated schema copy: Prisma may
# normalize the generated representation. A successful generator exit, verified
# runtime artifacts and a local fingerprint are authoritative for re-use.
# The fingerprint is not a secret and lives in the isolated homologation state.

function Get-AndonPrismaClientFingerprint {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $schemaPath = Join-Path $ServerRoot "prisma\schema.prisma"
    $lockPath = Join-Path $ServerRoot "package-lock.json"
    $prismaPath = Join-Path $ServerRoot "node_modules\prisma\package.json"
    $clientPath = Join-Path $ServerRoot "node_modules\@prisma\client\package.json"
    foreach ($required in @($schemaPath, $lockPath, $prismaPath, $clientPath)) {
        if (!(Test-Path $required -PathType Leaf)) { return $null }
    }

    try {
        $prisma = Get-Content $prismaPath -Raw -ErrorAction Stop | ConvertFrom-Json
        $client = Get-Content $clientPath -Raw -ErrorAction Stop | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$prisma.version) -or
            [string]::IsNullOrWhiteSpace([string]$client.version) -or
            [string]$prisma.version -ne [string]$client.version) {
            return $null
        }
        return [pscustomobject]@{
            schemaSha256 = (Get-FileHash $schemaPath -Algorithm SHA256 -ErrorAction Stop).Hash
            lockSha256 = (Get-FileHash $lockPath -Algorithm SHA256 -ErrorAction Stop).Hash
            prismaVersion = [string]$prisma.version
            clientVersion = [string]$client.version
        }
    } catch {
        return $null
    }
}

function Test-AndonPrismaClientArtifacts {
    param([Parameter(Mandatory = $true)][string]$ServerRoot)

    $clientRoot = Join-Path $ServerRoot "node_modules\.prisma\client"
    $artifacts = @(
        (Join-Path $clientRoot "index.js"),
        (Join-Path $clientRoot "query_engine-windows.dll.node"),
        (Join-Path $ServerRoot "node_modules\@prisma\client\default.js")
    )
    foreach ($path in $artifacts) {
        if (!(Test-Path $path -PathType Leaf)) { return $false }
        if ((Get-Item $path -ErrorAction Stop).Length -le 0) { return $false }
    }
    return $true
}

function Test-AndonPrismaClientCurrent {
    param(
        [Parameter(Mandatory = $true)][string]$ServerRoot,
        [Parameter(Mandatory = $true)][string]$StateRoot
    )

    $stampPath = Join-Path $StateRoot "prisma-client-fingerprint.json"
    if (!(Test-Path $stampPath -PathType Leaf)) { return $false }
    if (!(Test-AndonPrismaClientArtifacts -ServerRoot $ServerRoot)) { return $false }
    $current = Get-AndonPrismaClientFingerprint -ServerRoot $ServerRoot
    if ($null -eq $current) { return $false }

    try {
        $saved = Get-Content $stampPath -Raw -ErrorAction Stop | ConvertFrom-Json
        return (
            $saved.schemaSha256 -eq $current.schemaSha256 -and
            $saved.lockSha256 -eq $current.lockSha256 -and
            $saved.prismaVersion -eq $current.prismaVersion -and
            $saved.clientVersion -eq $current.clientVersion
        )
    } catch {
        return $false
    }
}

function Save-AndonPrismaClientFingerprint {
    param(
        [Parameter(Mandatory = $true)][string]$ServerRoot,
        [Parameter(Mandatory = $true)][string]$StateRoot
    )

    if (!(Test-AndonPrismaClientArtifacts -ServerRoot $ServerRoot)) {
        throw "Prisma generate terminou, mas os artefatos de execucao do Windows estao ausentes ou vazios."
    }
    $current = Get-AndonPrismaClientFingerprint -ServerRoot $ServerRoot
    if ($null -eq $current) {
        throw "Prisma generate terminou, mas a instalacao/versionamento de prisma e @prisma/client nao corresponde."
    }
    if (!(Test-Path $StateRoot -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
    }
    $stampPath = Join-Path $StateRoot "prisma-client-fingerprint.json"
    $tmpPath = Join-Path $StateRoot ("prisma-client-fingerprint-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        $current | ConvertTo-Json -Depth 3 | Set-Content -Path $tmpPath -Encoding UTF8
        Move-Item -Path $tmpPath -Destination $stampPath -Force
    } finally {
        if (Test-Path $tmpPath) {
            Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue
        }
    }
}
