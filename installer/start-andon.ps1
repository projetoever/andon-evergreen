. "C:\web-andon-industrial\installer\AndonInstaller.Common.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Docker.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Database.Local.ps1"
. "C:\web-andon-industrial\installer\AndonInstaller.Runtime.ps1"
try { Assert-AndonAdmin; Import-AndonConfig | Out-Null; Start-AndonRuntime; Invoke-AndonHealthCheck; exit 0 } catch { Write-AndonHeader "ERRO"; Write-AndonFail "$($_.Exception.Message)"; exit 1 }
