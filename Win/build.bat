@echo off
:: ============================================================
:: Freebuff Agent — Windows Build Script
:: Builds the app into a .exe installer (NSIS) + portable .exe
:: ============================================================
:: @author Virender Dhiman
:: @year 2025
:: @project Freebuff Agent
:: @license MIT

echo.
echo  ========================================
echo   Freebuff Agent — Windows Build
echo  ========================================
echo.

:: Step 1: Clean previous builds
echo [1/6] Cleaning previous builds...
if exist release rmdir /s /q release
if exist dist rmdir /s /q dist
if exist dist-electron rmdir /s /q dist-electron

:: Step 2: Install dependencies
echo [2/6] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

:: Step 3: Run tests
echo [3/6] Running tests...
call npx vitest run
if %errorlevel% neq 0 (
    echo WARNING: Some tests failed, but continuing build...
)

:: Step 4: Typecheck
echo [4/6] Running TypeScript typecheck...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo ERROR: Typecheck failed! Fix errors before building.
    pause
    exit /b 1
)

:: Step 5: Build the app
echo [5/6] Building Windows app...
call npx vite build
if %errorlevel% neq 0 (
    echo ERROR: Vite build failed!
    pause
    exit /b 1
)

:: Step 6: Build Electron package with electron-builder
:: Code signing is disabled (no certificate). To sign, set CSC_LINK env var.
echo.
echo [6/6] Building Electron package (NSIS installer + portable)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never
if %errorlevel% neq 0 (
    echo ERROR: electron-builder failed!
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   BUILD COMPLETE!
echo  ========================================
echo.
echo  Output files (in release\ folder):
echo    - Freebuff Agent Setup 1.0.0.exe   (NSIS installer)
echo    - Freebuff Agent 1.0.0.exe          (portable, no install needed)
echo.
echo  To run the dev version: npm run dev
echo.

:: Open the release folder
explorer release
pause
