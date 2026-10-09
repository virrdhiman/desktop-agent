@echo off
setlocal

if "%~1"=="" (
  echo Usage: Win\create-clean-vm.bat "C:\path\to\windows.iso"
  exit /b 1
)

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\create-clean-vm.ps1" -IsoPath "%~1"
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
