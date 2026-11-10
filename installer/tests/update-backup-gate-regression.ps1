$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$update = Get-Content (Join-Path $root "installer\update-andon-server.ps1") -Raw
$backup = Get-Content (Join-Path $root "installer\AndonInstaller.UpdateBackup.ps1") -Raw
function Assert-UpdateContract([bool]$ok,[string]$why) {
    if (!$ok) { throw "REFINE13 update backup gate failed: $why" }
}
$stop = $update.IndexOf("Stop-AndonRuntime")
$check = $update.IndexOf("Assert-AndonUpdateBackupRestorable -Config")
$migrate = $update.IndexOf("Invoke-AndonNodePipeline -RunSeed")
Assert-UpdateContract ($stop -ge 0 -and $stop -lt $check -and $check -lt $migrate) "backup order"
Assert-UpdateContract ($update.Contains("AndonInstaller.UpdateBackup.ps1")) "backup included in updater"
Assert-UpdateContract ($update.Contains("Backup/restore nao aprovado")) "fail closed on restore error"
foreach ($required in @(
    "pg_dump", "pg_restore", "createdb", "dropdb",
    "--format=custom", "--exit-on-error", "icacls.exe",
    "Get-FileHash", "restore-proof.json", "Get-AndonMappedDockerPort",
    "127.0.0.1", "Restauracao isolada nao comprovada"
)) {
    Assert-UpdateContract ($backup.Contains($required)) "required backup control $required"
}
Assert-UpdateContract (!$backup.Contains("db:seed")) "seed may not run in backup gate"

$common = Get-Content (Join-Path $root "installer\AndonInstaller.Common.ps1") -Raw
$menu = Get-Content (Join-Path $root "installer\menu-andon-installer.ps1") -Raw
$profile = Get-Content (Join-Path $root "installer\configure-andon-security-validation.ps1") -Raw
Assert-UpdateContract ($common.Contains('centralSecurityValidationEnabled = $false')) "feature flags default OFF"
Assert-UpdateContract ($common.Contains('ANDON_CENTRAL_DECLARED_ATTENDANCE_HTTP_ENABLED')) "declared attendance flag preserved"
Assert-UpdateContract ($common.Contains('ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED')) "R12 inventory flag preserved"
Assert-UpdateContract ($common.Contains('ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED')) "R12 global settings flag preserved"
Assert-UpdateContract ($common.Contains('Homologacao de seguranca exige login central, HTTPS e PostgreSQL local')) "secure activation preflight"
Assert-UpdateContract (!$menu.Contains('15 - Recursos de seguranca (homologacao no notebook)')) "do not restore legacy menu option 15"
Assert-UpdateContract ($profile.Contains('NOTEBOOK_ISOLADO')) "typed notebook confirmation"
Assert-UpdateContract ($profile.Contains('Stop-AndonRuntime')) "profile switch stops runtime"
Assert-UpdateContract ($profile.Contains('Write-AndonBackendEnv -Config $config')) "rebuild env after profile selection"
Write-Host "REFINE13: updater backup/restore ordering and fail-closed checks PASS"
