@echo off
:: ============================================================
:: VD Agent - Windows Build Script
:: Builds an NSIS installer and a portable .exe into release\
:: ============================================================
:: @author Virender Dhiman
:: @project VD Agent
:: @license Proprietary. See LICENSE.

setlocal
cd /d "%~dp0.."

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v

echo.
echo  ========================================
echo   VD Agent %VERSION% - Windows Build
echo  ========================================
echo.

echo [1/7] Cleaning previous builds...
if exist release rmdir /s /q release
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron

echo [2/7] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo [3/7] Running tests...
call npm test
if %errorlevel% neq 0 (
    echo ERROR: Tests failed. Fix them before packaging.
    pause
    exit /b 1
)

echo [4/7] Running TypeScript typecheck...
call npm run lint
if %errorlevel% neq 0 (
    echo ERROR: Typecheck failed. Fix errors before building.
    pause
    exit /b 1
)

echo [5/7] Building renderer and Electron main process...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)

:: Signing: set CSC_LINK (path or base64 of a .pfx) and CSC_KEY_PASSWORD. package.json keeps
:: win.signAndEditExecutable off for unsigned local builds, so it is switched on here when signing.
echo.
echo [6/7] Packaging with electron-builder (NSIS installer + portable)...
set "BUILDER_ARGS=--win --publish never"
if defined CSC_LINK (
    echo       Signing with the certificate in CSC_LINK.
    set "BUILDER_ARGS=%BUILDER_ARGS% --config.win.signAndEditExecutable=true"
) else (
    echo       CSC_LINK is not set: this build is UNSIGNED. Do not publish it as an official release.
    set CSC_IDENTITY_AUTO_DISCOVERY=false
)
call npx electron-builder %BUILDER_ARGS%
if %errorlevel% neq 0 (
    echo ERROR: electron-builder failed.
    pause
    exit /b 1
)

echo [7/7] Writing SHA-256 checksums...
call npm run checksums
if %errorlevel% neq 0 (
    echo ERROR: Checksum generation failed.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   BUILD COMPLETE
echo  ========================================
echo.
echo  Output (release\):
echo    - VD Agent Setup %VERSION%.exe   (NSIS installer)
echo    - VD Agent %VERSION%.exe         (portable)
echo    - SHA256SUMS.txt                 (checksums to publish with the release)
echo.
echo  Before publishing, follow docs\RELEASE_CHECKLIST.md
echo.
echo  To run the dev version: npm run dev
echo.

explorer release
pause
endlocal
