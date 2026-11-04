$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Test-AndonPrismaClientCurrent.ps1")

# No Prisma command executed and no real DLL accessed. The fixture exercises
# only hash comparison and generated-client presence on the Windows runner.
$root = Join-Path $env:TEMP ("andon-prisma-current-" + [guid]::NewGuid().ToString("N"))
$schemaPath = Join-Path $root "prisma\schema.prisma"
$clientRoot = Join-Path $root "node_modules\.prisma\client"
New-Item -Path (Split-Path $schemaPath -Parent) -ItemType Directory -Force | Out-Null
New-Item -Path $clientRoot -ItemType Directory -Force | Out-Null

try {
    Set-Content -Path $schemaPath -Value 'model Machine { id String @id }' -NoNewline
    if (Test-AndonPrismaClientCurrent -ServerRoot $root) {
        throw "Um client inexistente nao pode ser considerado atual."
    }
    Copy-Item $schemaPath (Join-Path $clientRoot "schema.prisma")
    Set-Content (Join-Path $clientRoot "index.js") -Value 'module.exports = {};'
    Set-Content (Join-Path $clientRoot "query_engine-windows.dll.node") -Value "engine-simulado"
    Set-Content (Join-Path $clientRoot "package.json") -Value '{"name":".prisma/client","version":"6.19.0"}'
    if (!(Test-AndonPrismaClientCurrent -ServerRoot $root)) {
        throw "Client completo de schema identico deveria ser reutilizado."
    }
    Set-Content -Path $schemaPath -Value 'model Machine { id String @id; name String }' -NoNewline
    if (Test-AndonPrismaClientCurrent -ServerRoot $root) {
        throw "Schema modificado exige regenerate."
    }
    Copy-Item $schemaPath (Join-Path $clientRoot "schema.prisma") -Force
    Remove-Item (Join-Path $clientRoot "query_engine-windows.dll.node")
    if (Test-AndonPrismaClientCurrent -ServerRoot $root) {
        throw "Engine ausente nunca pode ser reutilizado."
    }
} finally {
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Prisma Client: reuso seguro, schema alterado e engine ausente testados." -ForegroundColor Green
