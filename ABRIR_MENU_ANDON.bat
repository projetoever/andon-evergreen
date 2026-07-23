@echo off
setlocal EnableExtensions

title ANDON WEB INDUSTRIAL - MENU

set "PROJECT_INSTALLER=C:\web-andon-industrial\andon\installer"
set "EXTERNAL_INSTALLER=C:\web-andon-industrial\installer"
set "MENU=%EXTERNAL_INSTALLER%\menu-andon-installer.ps1"

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Este menu precisa de Administrador.
  echo Abrindo janela elevada...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

if not exist "%PROJECT_INSTALLER%\menu-andon-installer.ps1" (
  echo ERRO: instalador oficial nao encontrado:
  echo %PROJECT_INSTALLER%
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $source = '%PROJECT_INSTALLER%'; $destination = '%EXTERNAL_INSTALLER%'; $files = @(Get-ChildItem -LiteralPath $source -Filter '*.ps1' -File); if ($files.Count -eq 0) { throw 'Nenhum script encontrado no instalador oficial.' }; New-Item -ItemType Directory -Path $destination -Force | Out-Null; foreach ($file in $files) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destination $file.Name) -Force -ErrorAction Stop }; Write-Host ('Instalador sincronizado: ' + $files.Count + ' script(s).') -ForegroundColor Green"

if not "%ERRORLEVEL%"=="0" (
  echo.
  echo ERRO: nao foi possivel sincronizar o instalador externo.
  echo.
  pause
  exit /b 1
)

if not exist "%MENU%" (
  echo ERRO: menu do ANDON nao encontrado:
  echo %MENU%
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%MENU%"
set "CODE=%ERRORLEVEL%"

echo.
echo Codigo de saida: %CODE%
pause
exit /b %CODE%