$ErrorActionPreference = "Stop"
$SourceRoot = Split-Path -Parent $PSCommandPath
$SourceInstaller = Join-Path $SourceRoot "installer"
$BasePath = "C:\web-andon-industrial"
$InstallerPath = Join-Path $BasePath "installer"
$LauncherPath = Join-Path $BasePath "ABRIR_MENU_ANDON.bat"
function Write-Ok($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Fail($m) { Write-Host "[FALHA] $m" -ForegroundColor Red }
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Fail "Execute como Administrador."; exit 1 }
if (!(Test-Path $SourceInstaller)) { Write-Fail "Pasta installer nao encontrada no pacote: $SourceInstaller"; exit 1 }
New-Item -ItemType Directory -Force $InstallerPath | Out-Null
Copy-Item (Join-Path $SourceInstaller "*") $InstallerPath -Recurse -Force
@'
@echo off
setlocal EnableExtensions
title ANDON WEB INDUSTRIAL - MENU V10.5.1
set "MENU=C:\web-andon-industrial\installer\menu-andon-installer.ps1"
if not exist "%MENU%" (
  echo ERRO: menu do ANDON nao encontrado:
  echo %MENU%
  echo.
  pause
  exit /b 1
)
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Este menu precisa de Administrador.
  echo Abrindo janela elevada...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MENU%"
set "CODE=%ERRORLEVEL%"
echo.
echo Codigo de saida: %CODE%
pause
exit /b %CODE%
'@ | Set-Content $LauncherPath -Encoding ASCII
Write-Ok "Installer V10.5.1 copiado para: $InstallerPath"
Write-Ok "Launcher criado: $LauncherPath"
Write-Host ""
Write-Host "Abrindo menu..."
powershell.exe -ExecutionPolicy Bypass -NoProfile -File (Join-Path $InstallerPath "menu-andon-installer.ps1")
exit $LASTEXITCODE
