<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Troubleshooting

## Installing and starting

| Problem | Fix |
|---------|-----|
| Windows: "Windows protected your PC" | The build is unsigned. If it came from the official Releases page and the checksum matches, click **More info → Run anyway**. See [INSTALL.md](./INSTALL.md#first-launch-warnings). |
| macOS: "developer cannot be verified" | Right-click the app and choose **Open**, or use **System Settings → Privacy & Security → Open Anyway**. |
| Linux: AppImage won't start | `chmod +x` the file. On Ubuntu 22.04 and later, `sudo apt install libfuse2`. |
| Window is blank | Open DevTools with `Ctrl+Shift+I` (`Cmd+Option+I` on macOS) and check the Console for errors. |
| Start fresh | Quit the app and rename the user data folder (`%APPDATA%\VD Agent`, `~/Library/Application Support/VD Agent`, or `~/.config/VD Agent`). This resets settings, keys, and chats. |

## Running from source

| Problem | Fix |
|---------|-----|
| `npm install` fails on `node-pty` | Install native build tools: Visual Studio Build Tools with "Desktop development with C++" and Python 3 on Windows, Xcode Command Line Tools on macOS, or `build-essential` and `python3` on Linux. Then run `npm install` again. |
| `npm test` fails to start | Use Node.js 20 or newer. |
| Port 5173 is in use | Stop the other dev server, or close the other VD Agent dev instance. |

## The agent

| Message or symptom | Fix |
|--------------------|-----|
| "No API key configured" | Add a key for the active provider in Settings. |
| "… rejected the API key" | The key is wrong, expired, or revoked. Copy it again from the provider. VD Agent intentionally doesn't fall back to other providers on auth errors. |
| Rate limited, or all providers failed | Wait a minute, add keys for more free providers so fallback has somewhere to go, or use a local model. |
| It picked a weak or wrong model | Pin a model from the menu in the Agent header. Choose **Auto** to return to automatic selection. |
| "Stopped after 10 tool rounds" | Reply "continue" to let it keep going. |
| Local model doesn't respond | Make sure Ollama or LM Studio is running, and that the model name in Settings matches a model you've installed. |
| Timeouts | Check your connection or proxy, or try another provider. |

## Editor, files, and git

| Problem | Fix |
|---------|-----|
| I clicked a file but don't see it | The editor appears to the right of the **Agent** panel. Switch to 🤖 Agent to see open files. |
| Editor stuck on "Loading editor..." | Make sure you're on the latest version. Earlier builds loaded the editor from a CDN that the app blocked. |
| "Not a git repository" | Run `git init` in the workspace, or open a folder that is a git repository. |
| Push rejected | Pull first (`git pull --rebase`), then push. |

## Chat history

| Problem | Fix |
|---------|-----|
| A chat is missing after restart | A chat is saved once you've sent at least one message. Click **🕘 History** in the Agent header. Files are in `<user data>/conversations/`. |
| A chat file is corrupt | It is skipped when the list loads. Remove the bad file from `conversations/`. |

## Building

| Problem | Fix |
|---------|-----|
| Type errors | Run `npm run lint` and fix what it reports. |
| The build script stops at tests | Run `npm test`. The scripts refuse to package with failing tests. |
| Windows signing fails extracting `winCodeSign` with a symbolic link error | Enable Windows Developer Mode or run the terminal as Administrator, then build again. |
| The app uses the default Electron icon | Add `build/icon.ico`, `build/icon.icns`, and `build/icon.png` (512×512). See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md). |
| `npm run smoke` fails to open a window on Linux CI | It needs a display. Run it under `xvfb-run`. |

Still stuck? [Open an issue](https://github.com/virrdhiman/desktop-agent/issues) with your OS, VD Agent version, and the exact error. Leave API keys out of screenshots and logs.
