#!/bin/bash
# ============================================================
# PIT Agent - macOS Build Script
# Builds a .dmg installer and a .zip archive into release/
# ============================================================
# @author Virender Dhiman
# @project PIT Agent
# @license Proprietary. See LICENSE.

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")

echo ""
echo "  ========================================"
echo "   PIT Agent ${VERSION} - macOS Build"
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

# Signing: set CSC_LINK + CSC_KEY_PASSWORD (a Developer ID Application .p12) or CSC_NAME
# (an identity in the keychain). Notarization needs Apple credentials; see docs/RELEASE_CHECKLIST.md.
echo ""
echo "[6/7] Packaging with electron-builder (DMG + ZIP)..."
if [ -n "${CSC_LINK:-}" ] || [ -n "${CSC_NAME:-}" ]; then
  echo "      Signing with the configured certificate."
else
  echo "      CSC_LINK/CSC_NAME not set: this build is UNSIGNED. Do not publish it as an official release."
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi
npx electron-builder --mac --publish never || { echo "ERROR: electron-builder failed."; exit 1; }

echo "[7/7] Writing SHA-256 checksums..."
npm run checksums || { echo "ERROR: Checksum generation failed."; exit 1; }

echo ""
echo "  ========================================"
echo "   BUILD COMPLETE"
echo "  ========================================"
echo ""
echo "  Output (release/):"
echo "    - PIT Agent-${VERSION}.dmg       (installer)"
echo "    - PIT Agent-${VERSION}-mac.zip   (archive)"
echo "    - SHA256SUMS.txt                (checksums to publish with the release)"
echo ""
echo "  Before publishing, follow docs/RELEASE_CHECKLIST.md"
echo ""

open release
