@echo off
setlocal

set "ROOT=%~dp0.."
set "LOG_DIR=%ROOT%\logs"
set "LOG=%LOG_DIR%\vm-host-setup.log"

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator permission for VM host setup...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/k ""%~f0""' -Verb RunAs"
  exit /b 0
)

pushd "%ROOT%" >nul

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo VD Agent VM host setup started at %DATE% %TIME% > "%LOG%"
echo Root: %ROOT% >> "%LOG%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\setup-vm-host.ps1" -Prefer VirtualBox >> "%LOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

type "%LOG%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo VM host setup failed with exit code %EXIT_CODE%.
  echo Log: %LOG%
) else (
  echo VM host setup completed.
  echo Log: %LOG%
)
echo.
pause

popd >nul
exit /b %EXIT_CODE%
