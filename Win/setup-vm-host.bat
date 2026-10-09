@echo off
setlocal

set "ROOT=%~dp0.."
pushd "%ROOT%" >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\setup-vm-host.ps1" -Prefer VirtualBox
set "EXIT_CODE=%ERRORLEVEL%"

popd >nul
exit /b %EXIT_CODE%
