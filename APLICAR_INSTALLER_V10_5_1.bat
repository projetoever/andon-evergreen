@echo off
setlocal EnableExtensions
title APLICAR INSTALLER ANDON V10.5.1
set "SCRIPT=%~dp0APLICAR_INSTALLER_V10_5_1.ps1"
if not exist "%SCRIPT%" (
  echo ERRO: script nao encontrado:
  echo %SCRIPT%
  pause
  exit /b 1
)
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Este instalador precisa de Administrador.
  echo Abrindo janela elevada...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "CODE=%ERRORLEVEL%"
echo.
echo Codigo de saida: %CODE%
pause
exit /b %CODE%
