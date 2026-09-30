#!/bin/bash
# ============================================================
# VD Agent - Linux Build Script
# Builds an AppImage and a .deb package into release/
# ============================================================
# @author Virender Dhiman
# @project VD Agent
# @license Proprietary. See LICENSE.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")

echo ""
echo "  ========================================"
echo "   VD Agent ${VERSION} - Linux Build"
echo "  ========================================"
echo ""

echo "[1/7] Cleaning previous builds..."
rm -rf release dist dist-electron

echo "[2/7] Installing dependencies..."
npm install

echo "[3/7] Running tests..."
npm test || { echo "ERROR: Tests failed. Fix them before packaging."; exit 1; }

echo "[4/7] Running TypeScript typecheck..."
npm run lint || { echo "ERROR: Typecheck failed. Fix errors before building."; exit 1; }

echo "[5/7] Building renderer and Electron main process..."
npm run build || { echo "ERROR: Build failed."; exit 1; }

echo ""
echo "[6/7] Packaging with electron-builder (AppImage + deb)..."
npx electron-builder --linux --publish never || { echo "ERROR: electron-builder failed."; exit 1; }

echo "[7/7] Writing SHA-256 checksums..."
npm run checksums || { echo "ERROR: Checksum generation failed."; exit 1; }

echo ""
echo "  ========================================"
echo "   BUILD COMPLETE"
echo "  ========================================"
echo ""
echo "  Output (release/):"
echo "    - VD Agent-${VERSION}.AppImage"
echo "    - vd-agent_${VERSION}_amd64.deb"
echo "    - SHA256SUMS.txt   (checksums to publish with the release)"
echo ""
echo "  Before publishing, follow docs/RELEASE_CHECKLIST.md"
echo ""
