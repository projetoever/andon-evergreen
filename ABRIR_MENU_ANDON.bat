@echo off
set MENU=C:\web-andon-industrial\installer\menu-andon-installer.ps1

if not exist "%MENU%" (
  echo ERRO: menu do instalador nao encontrado:
  echo %MENU%
  echo.
  echo Execute primeiro o INSTALAR_ANDON_SERVIDOR.ps1
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -NoProfile -File ""%MENU%""'"
exit /b 0
