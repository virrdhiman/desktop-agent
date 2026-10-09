@echo off
setlocal
cd /d "%~dp0.."
if "%~1"=="" (
  echo Usage: Win\prepare-clean-vm-qa.bat "C:\path\to\windows.iso"
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\prepare-clean-vm-qa.ps1" -IsoPath "%~1"
if errorlevel 1 (
  echo.
  echo Clean VM QA preparation failed.
  pause
  exit /b 1
)
echo.
pause
