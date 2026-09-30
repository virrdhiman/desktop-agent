#!/bin/bash
# ============================================================
# VD Agent - macOS Build Script
# Builds a .dmg installer and a .zip archive into release/
# ============================================================
# @author Virender Dhiman
# @project VD Agent
# @license Proprietary. See LICENSE.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")

echo ""
echo "  ========================================"
echo "   VD Agent ${VERSION} - macOS Build"
echo "  ========================================"
echo ""

echo "[1/6] Cleaning previous builds..."
rm -rf release dist dist-electron

echo "[2/6] Installing dependencies..."
npm install

echo "[3/6] Running tests..."
npm test || { echo "ERROR: Tests failed. Fix them before packaging."; exit 1; }

echo "[4/6] Running TypeScript typecheck..."
npm run lint || { echo "ERROR: Typecheck failed. Fix errors before building."; exit 1; }

echo "[5/6] Building renderer and Electron main process..."
npm run build || { echo "ERROR: Build failed."; exit 1; }

# Code signing is disabled (no certificate). To sign, set CSC_LINK and CSC_KEY_PASSWORD.
echo ""
echo "[6/6] Packaging with electron-builder (DMG + ZIP)..."
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac --publish never || { echo "ERROR: electron-builder failed."; exit 1; }

echo ""
echo "  ========================================"
echo "   BUILD COMPLETE"
echo "  ========================================"
echo ""
echo "  Output (release/):"
echo "    - VD Agent-${VERSION}.dmg       (installer)"
echo "    - VD Agent-${VERSION}-mac.zip   (archive)"
echo ""
echo "  To run the dev version: npm run dev"
echo ""

open release
