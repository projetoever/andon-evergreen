param(
    [Parameter(Mandatory = $true)]
    [string]$ServerAddress,

    [int]$FrontendPort = 8080,

    [switch]$OpenAfterCreate
)

$ErrorActionPreference = "Stop"

$normalizedAddress = $ServerAddress.Trim()
if ([string]::IsNullOrWhiteSpace($normalizedAddress)) {
    throw "Informe o IP ou nome do servidor ANDON."
}

if ($normalizedAddress -match '^https?://') {
    $baseUrl = $normalizedAddress.TrimEnd('/')
} elseif ($normalizedAddress -match ':\d+$') {
    $baseUrl = "http://$normalizedAddress"
} else {
    $baseUrl = "http://{0}:{1}" -f $normalizedAddress, $FrontendPort
}

$biUrl = "$baseUrl/bi"
$desktopPath = [Environment]::GetFolderPath("Desktop")

if ([string]::IsNullOrWhiteSpace($desktopPath)) {
    throw "Nao foi possivel localizar a Area de Trabalho do usuario."
}

$shortcutPath = Join-Path $desktopPath "ANDON BI.url"
$shortcutContent = @(
    "[InternetShortcut]",
    "URL=$biUrl"
)

Set-Content -LiteralPath $shortcutPath -Value $shortcutContent -Encoding ASCII

Write-Host "Atalho criado com sucesso:" -ForegroundColor Green
Write-Host $shortcutPath
Write-Host ""
Write-Host "Destino:"
Write-Host $biUrl

if ($OpenAfterCreate) {
    Start-Process $biUrl
}
