@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\setup-release-secrets.ps1" %*
if errorlevel 1 (
  echo.
  echo Release secret setup failed.
  pause
  exit /b 1
)
echo.
echo Release secret setup finished.
pause
