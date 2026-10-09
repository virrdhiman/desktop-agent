@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\create-local-test-certificate.ps1" %*
if errorlevel 1 (
  echo.
  echo Local test certificate creation failed.
  pause
  exit /b 1
)
echo.
pause
