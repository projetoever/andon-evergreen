$BasePath = "C:\web-andon-industrial"
$ProjectPath = "$BasePath\andon"
$LogsPath = "$ProjectPath\logs"

New-Item -ItemType Directory -Force $LogsPath | Out-Null

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path "$LogsPath\postgres.log" -Value $line
}

Write-Log "Verificando servico PostgreSQL..."

$pgService = Get-Service | Where-Object {
    $_.Name -like "*postgres*" -or $_.DisplayName -like "*postgres*"
} | Sort-Object Name | Select-Object -First 1

if ($pgService) {
    Write-Log "Servico PostgreSQL encontrado: $($pgService.Name) / Status: $($pgService.Status)"

    if ($pgService.Status -ne "Running") {
        Write-Log "Iniciando PostgreSQL..."
        Start-Service -Name $pgService.Name
        Start-Sleep -Seconds 8
    } else {
        Write-Log "PostgreSQL ja esta rodando."
    }
} else {
    Write-Log "ATENCAO: Nenhum servico PostgreSQL encontrado."
}
