@echo off
setlocal

set "ROOT=%~dp0.."

net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo Requesting Administrator permission for VM host setup...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%ComSpec%' -ArgumentList '/c ""%~f0""' -Verb RunAs"
  exit /b 0
)

pushd "%ROOT%" >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\setup-vm-host.ps1" -Prefer VirtualBox
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
