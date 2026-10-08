<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Installing VD Agent

VD Agent is free to download and use under the [VD Agent License](../LICENSE). Only download it from the official sources:

- Releases: https://github.com/virrdhiman/desktop-agent/releases
- Source: https://github.com/virrdhiman/desktop-agent

## System requirements

- **Windows**: Windows 10 or 11, 64-bit.
- **macOS**: macOS 10.15 or later. Builds are made for the architecture of the machine that built them. Apple Silicon files end in `-arm64`.
- **Linux**: 64-bit distribution that can run an AppImage, or Debian/Ubuntu for the `.deb`.
- An internet connection for cloud AI providers, or a local model server such as Ollama.

## Download

From the [latest release](https://github.com/virrdhiman/desktop-agent/releases), download one file:

| System | File | Notes |
|--------|------|-------|
| Windows | `VD Agent Setup <version>.exe` | Installer. Shows the license, lets you pick a folder, and adds Start menu and desktop shortcuts. |
| Windows | `VD Agent <version>.exe` | Portable. Runs without installing. |
| macOS | `VD Agent-<version>.dmg` | Drag VD Agent into Applications. |
| macOS | `VD Agent-<version>-mac.zip` | The same app as a zip archive. |
| Linux | `VD Agent-<version>.AppImage` | Runs on most distributions. |
| Linux | `vd-agent_<version>_amd64.deb` | For Debian and Ubuntu. |

## Verify your download

Each release includes `SHA256SUMS.txt`. Compare the SHA-256 hash of your file with the matching line:

```powershell
# Windows (PowerShell)
Get-FileHash ".\VD Agent Setup 1.1.0.exe" -Algorithm SHA256
```

```bash
# macOS
shasum -a 256 "VD Agent-1.1.0.dmg"

# Linux: checks every file listed in SHA256SUMS.txt that is in the current folder
sha256sum -c SHA256SUMS.txt --ignore-missing
```

If the hashes don't match, delete the file and download it again from the Releases page.

## Install

- **Windows installer**: run `VD Agent Setup <version>.exe`, accept the license, and choose an install folder. Installing for just yourself does not need administrator rights.
- **Windows portable**: put `VD Agent <version>.exe` anywhere and run it.
- **macOS**: open the `.dmg` and drag **VD Agent** into **Applications**.
- **Linux AppImage**: `chmod +x "VD Agent-<version>.AppImage"`, then run it. On Ubuntu 22.04 and later you may need `sudo apt install libfuse2`.
- **Linux .deb**: `sudo apt install ./vd-agent_<version>_amd64.deb`

## What The Installer Includes

The Windows installer installs **VD Agent** only. It includes the local
`vd-agent-vscode-bridge` VSIX package inside the app resources so VD Agent can
install it later from the **VS Code Bridge** panel.

The installer does **not** silently install these on the user's machine:

- Visual Studio Code
- the VD Agent VS Code extension inside VS Code
- Ollama
- local Ollama models such as `qwen2.5-coder`
- API keys or private provider settings

This is intentional. VS Code, extensions, local model runtimes, and API keys are
user-level tools/settings and should be installed or connected explicitly. After
VD Agent is installed, open **VS Code Bridge** and use:

1. **Install VS Code** if VS Code is missing.
2. **Load Bridge into VS Code** to install the bundled VSIX into VS Code.
3. **Open Workspace** and run `VD Agent: Export Workspace Context` in VS Code.
4. **Test Autocomplete** to verify the bridge can produce local inline
   completion candidates in the active VS Code file.

For local no-cost AI autocomplete, install Ollama separately and pull a model:

```powershell
ollama pull qwen2.5-coder:1.5b
```

## First launch warnings

Official releases should be code-signed. If you run an unsigned build, the OS warns you the first time:

- **Windows SmartScreen** ("Windows protected your PC"): click **More info**, then **Run anyway**, if you downloaded the file from the official Releases page and its checksum matches.
- **macOS Gatekeeper** ("cannot be opened because the developer cannot be verified"): right-click the app and choose **Open**, or go to **System Settings → Privacy & Security** and click **Open Anyway**.

Only bypass these warnings for files from the official source.

## After installing

Follow [Free API key setup](../README.md#free-api-key-setup) to add a key and send your first message. Your data is stored in:

| OS | Folder |
|----|--------|
| Windows | `%APPDATA%\VD Agent` |
| macOS | `~/Library/Application Support/VD Agent` |
| Linux | `~/.config/VD Agent` |

## Update

Installed builds check release metadata over HTTPS, verify artifact integrity, and download an available update in the background when automatic updates are enabled in Settings. Official release packages should also be code-signed. VD asks before restarting to install. Your chats, settings, checkpoints, and keys are kept because they live in the user data folder, not the install folder.

Automatic GitHub updates require anonymously accessible release files. While the official repository is private, automatic checks default to off; use a public release feed or download a newer release manually and install it over the old one. Update checks can be enabled or disabled in Settings.

If you run from source: `git pull`, `npm install`, then `npm run dev`.

## Uninstall

- **Windows**: Settings → Apps → VD Agent → Uninstall. For the portable build, delete the `.exe`.
- **macOS**: move VD Agent from Applications to the Trash.
- **Linux**: delete the AppImage, or `sudo apt remove vd-agent`.

Uninstalling leaves your user data in place. To remove chats, settings, and stored keys too, delete the user data folder listed above.

## Run from source

### Prerequisites

- **Node.js 22.19 or newer** and npm. Node.js 20 is not supported. The install pins `undici` 8 (a security override, also required by the test runner), and that release requires Node.js 22.19+.
- **git**
- Native build tools for `node-pty`, which powers the terminal:
  - Windows: Visual Studio Build Tools with the "Desktop development with C++" workload, and Python 3
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `build-essential` and `python3`

`node-pty`'s install script checks for a prebuild and otherwise compiles with `node-gyp` (`node scripts/prebuild.js || node-gyp rebuild`). Windows and macOS ship prebuilds. Linux does not, so install compiles the module and the tools above have to be present.

npm 11 still runs that install script. It also warns until the script is approved. This repo allows it with `"allowScripts": { "node-pty": true }` in `package.json`. If the terminal native module is missing because scripts were skipped, rebuild it:

```bash
npm rebuild node-pty
```

### Run

```bash
git clone https://github.com/virrdhiman/desktop-agent.git
cd desktop-agent
npm install
npm run dev
```

The app window opens once the dev server is ready. Building your own installers is covered in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md#build-commands). Builds you make yourself are for your own use; the license does not allow redistributing them.
