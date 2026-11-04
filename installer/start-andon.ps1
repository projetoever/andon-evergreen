. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"
try {
    Assert-AndonAdmin
    $localProfileScript = Join-Path $Global:AndonProjectPath "installer\AndonInstaller.LocalHttps.ps1"
    if (Test-Path $localProfileScript -PathType Leaf) {
        . $localProfileScript
        if (Test-AndonLocalHttpsProfile -ProjectRoot $Global:AndonProjectPath) {
            Invoke-AndonLocalHttpsProfile -ProjectRoot $Global:AndonProjectPath -Action Start
            exit 0
        }
    }
    Import-AndonConfig | Out-Null
    Start-AndonRuntime
    Invoke-AndonHealthCheck
    exit 0
} catch {
    Write-AndonHeader "ERRO"
    Write-AndonFail "$($_.Exception.Message)"
    exit 1
}
