@echo off
setlocal EnableExtensions
title ANDON WEB INDUSTRIAL - MENU V10.6.1
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
