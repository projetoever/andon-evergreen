# Queries Docker using a non-erroring listing, so a missing (or renamed)
# homologation container is treated as ABSENT under PowerShell 5.1
# ErrorActionPreference=Stop. Exact name check excludes backup containers.
function Test-AndonHttpsDockerContainerExists {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$ContainerName)

    $names = @(& docker.exe container ls -a --format '{{.Names}}')
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel consultar os containers Docker. Verifique o Docker Desktop."
    }
    return ($names -ccontains $ContainerName)
}
