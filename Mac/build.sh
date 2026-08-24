#!/bin/bash
# ============================================================
# Freebuff Agent — macOS Build Script
# Builds the app into a .dmg installer + .app bundle
# ============================================================
# @author Virender Dhiman
# @year 2025
# @project Freebuff Agent
# @license MIT

echo ""
echo "  ========================================"
echo "   Freebuff Agent — macOS Build"
echo "  ========================================"
echo ""

set -e

# Step 1: Clean previous builds
echo "[1/6] Cleaning previous builds..."
rm -rf release dist dist-electron

# Step 2: Install dependencies
echo "[2/6] Installing dependencies..."
npm install

# Step 3: Run tests
echo "[3/6] Running tests..."
npx vitest run || echo "WARNING: Some tests failed, continuing build..."

# Step 4: Typecheck
echo "[4/6] Running TypeScript typecheck..."
npx tsc --noEmit || {
    echo "ERROR: Typecheck failed! Fix errors before building."
    exit 1
}

# Step 5: Build the app
echo "[5/6] Building macOS app..."
npx vite build || {
    echo "ERROR: Vite build failed!"
    exit 1
}

# Step 6: Build Electron package with electron-builder
# Code signing is disabled (no certificate). To sign, set CSC_LINK env var.
echo ""
echo "[6/6] Building Electron package (DMG + ZIP)..."
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac --publish never || {
    echo "ERROR: electron-builder failed!"
    exit 1
}

echo ""
echo "  ========================================"
echo "   BUILD COMPLETE!"
echo "  ========================================"
echo ""
echo "  Output files (in release/ folder):"
echo "    - Freebuff Agent-1.0.0.dmg        (installer)"
echo "    - Freebuff Agent-1.0.0-mac.zip     (archive)"
echo ""
echo "  To run the dev version: npm run dev"
echo ""

# Open the release folder
open release
