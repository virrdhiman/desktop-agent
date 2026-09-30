@echo off
:: ============================================================
:: VD Agent - Windows Build Script
:: Builds an NSIS installer and a portable .exe into release\
:: ============================================================
:: @author Virender Dhiman
:: @project VD Agent
:: @license MIT

setlocal
cd /d "%~dp0.."

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VERSION=%%v

echo.
echo  ========================================
echo   VD Agent %VERSION% - Windows Build
echo  ========================================
echo.

echo [1/6] Cleaning previous builds...
if exist release rmdir /s /q release
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron

echo [2/6] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo [3/6] Running tests...
call npm test
if %errorlevel% neq 0 (
    echo ERROR: Tests failed. Fix them before packaging.
    pause
    exit /b 1
)

echo [4/6] Running TypeScript typecheck...
call npm run lint
if %errorlevel% neq 0 (
    echo ERROR: Typecheck failed. Fix errors before building.
    pause
    exit /b 1
)

echo [5/6] Building renderer and Electron main process...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)

:: Code signing is disabled (no certificate). To sign, set CSC_LINK and CSC_KEY_PASSWORD.
echo.
echo [6/6] Packaging with electron-builder (NSIS installer + portable)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never
if %errorlevel% neq 0 (
    echo ERROR: electron-builder failed.
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
echo.
echo  To run the dev version: npm run dev
echo.

explorer release
pause
endlocal
