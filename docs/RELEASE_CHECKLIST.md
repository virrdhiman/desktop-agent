<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Release Checklist

How to build, sign, verify, and publish a VD Agent release on GitHub. Only the maintainer publishes official releases; the [license](../LICENSE) does not allow others to redistribute builds.

## Build commands

Each platform has to be built on that OS. Every script cleans `release/`, `dist/`, and `dist-electron/`, then runs `npm install`, `npm test`, `npm run lint`, and `npm run build`. It packages with electron-builder, writes `release/SHA256SUMS.txt`, and stops at the first failure.

| Platform | Command | Output in `release/` |
|----------|---------|----------------------|
| Windows | `Win\build.bat` | `VD Agent Setup <version>.exe` (NSIS installer) and `VD Agent <version>.exe` (portable) |
| macOS | `bash Mac/build.sh` | `VD Agent-<version>.dmg` and `VD Agent-<version>-mac.zip` (`-arm64` in the name on Apple Silicon) |
| Linux | `bash Linux/build.sh` | `VD Agent-<version>.AppImage` and `vd-agent_<version>_amd64.deb` |

**Only upload files built by these scripts.** `release/` can also contain test builds made with manual `electron-builder` commands, for example with native module rebuilds turned off. Those are not release builds; delete them or rebuild with the official script.

## Code signing

Public builds should be signed so users don't get SmartScreen or Gatekeeper warnings. Unsigned builds work, and the scripts print an **UNSIGNED** warning when they make one, but don't publish them as official releases if you can avoid it.

- **Windows**: set `CSC_LINK` (path to, or base64 of, a `.pfx` code-signing certificate) and `CSC_KEY_PASSWORD`, then run `Win\build.bat`. `package.json` keeps `win.signAndEditExecutable` off for unsigned local builds, and the script turns it on when `CSC_LINK` is set. That also embeds the icon and version info in the `.exe`. If extracting `winCodeSign` fails with a symbolic link error, enable Developer Mode or build from an Administrator terminal.
- **macOS**: set `CSC_LINK` and `CSC_KEY_PASSWORD` for a "Developer ID Application" `.p12`, or `CSC_NAME` for an identity in your keychain. For builds that open without warnings, also notarize with your Apple ID credentials. See the [electron-builder code signing](https://www.electron.build/code-signing) and [macOS](https://www.electron.build/configuration/mac) docs.
- **Linux**: AppImage and `.deb` are usually unsigned. Publish checksums, and optionally a GPG signature of `SHA256SUMS.txt`.

Never commit certificates, passwords, or `.env` files.

## Before building

- [ ] `main` is clean and up to date: `git status`, `git pull`
- [ ] Version bumped in `package.json`: `npm version <x.y.z> --no-git-tag-version`
- [ ] `CHANGELOG.md` has a section for the version, with the release date
- [ ] Docs match the release: README, USAGE, `docs/`
- [ ] App icons exist: `build/icon.ico` (Windows), `build/icon.icns` (macOS), `build/icon.png` 512×512 (Linux). Without them, electron-builder uses the default Electron icon.
- [ ] Signing certificates are available on each build machine (see above)

## Build and verify

- [ ] `npm test`, `npm run lint`, and `npm run build` pass
- [ ] `npm run smoke` passes. It launches the dev build twice with a throwaway profile and checks the UI, IPC, chat persistence, key redaction, the editor, and link handling.
- [ ] Build with the official script on each platform
- [ ] Smoke-test the packaged app:
  - Windows: `npm run smoke -- --exe "release/win-unpacked/VD Agent.exe"`
  - macOS: `npm run smoke -- --exe "release/mac/VD Agent.app/Contents/MacOS/VD Agent"` (`mac-arm64` on Apple Silicon)
  - Linux: `npm run smoke -- --exe release/linux-unpacked/vd-agent`
- [ ] Install from the installer on a clean machine or VM. Check that the license page appears, the app launches, a chat works with a real key, the app restarts with history intact, and it uninstalls cleanly.
- [ ] If signed, check the signature: file Properties → Digital Signatures on Windows, `codesign --verify --deep --strict` and `spctl -a -vv` on macOS

## Checksums

The build scripts write `release/SHA256SUMS.txt` in `sha256sum` format. To regenerate it after changing files in `release/`:

```bash
npm run checksums
```

When you build on several machines, combine the per-platform files into one `SHA256SUMS.txt` for the release, one line per file.

## Publish on GitHub

1. Commit the version bump and changelog, then tag and push:
   ```bash
   git tag v<x.y.z>
   git push origin main --tags
   ```
2. Create a **draft** release with only the installers and the checksum file:
   ```bash
   gh release create v<x.y.z> --draft --title "VD Agent <x.y.z>" --notes-file notes.md \
     "release/VD Agent Setup <x.y.z>.exe" "release/VD Agent <x.y.z>.exe" \
     "release/VD Agent-<x.y.z>.dmg" "release/VD Agent-<x.y.z>-mac.zip" \
     "release/VD Agent-<x.y.z>.AppImage" "release/vd-agent_<x.y.z>_amd64.deb" \
     SHA256SUMS.txt
   ```
   Use the version's `CHANGELOG.md` section as `notes.md`, and say whether each build is signed.
3. Don't upload `win-unpacked/`, `mac/`, `linux-unpacked/`, `builder-debug.yml`, `latest*.yml`, or `.blockmap` files. VD Agent has no auto-updater, so they aren't needed.
4. Download each file from the draft, check it against `SHA256SUMS.txt`, and publish the release.

## After publishing

- [ ] The README "Download and Install" table matches the file names
- [ ] The Releases badge shows the new version
- [ ] Repository settings: description, website (`https://virender.in`), and topics are set, and private vulnerability reporting is on (Settings → Security) if you want reports through GitHub
