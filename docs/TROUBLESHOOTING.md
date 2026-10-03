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
| `npm test` fails to start | Use Node.js 20.19 or newer. |
| Port 5173 is in use | Stop the other dev server, or close the other VD Agent dev instance. |

## The agent

| Message or symptom | Fix |
|--------------------|-----|
| "No API key is configured" | Add a key for the active provider in Settings. |
| "… failed, so this answer came from …" | Informational. The active provider failed (the reason is in brackets) and another free provider answered. Fix or wait out the first provider, or make the other one active. |
| "… returned an unusable reply" | The model's reply was empty, only pleasantries, or looping, even after one automatic retry. Send the request again, rephrase it, or pin a stronger model. |
| "Check this reply: it says the agent …" | The reply claims edits, commands, or passing tests that no tool call in that request performed. Ask the agent to make the change and run the check, or verify it yourself. |
| "… rejected the API key" | The key is wrong, expired, or revoked. Copy it again from the provider. VD Agent intentionally doesn't fall back to other providers on auth errors. |
| Rate limited, or all providers failed | Wait a minute, add keys for more free providers so fallback has somewhere to go, or use a local model. |
| It picked a weak or wrong model | Pin a model from the menu in the Agent header. Choose **Auto** to return to automatic selection. |
| "Stopped after 10 tool rounds" | Reply "continue" to let it keep going. |
| Local model doesn't respond | Make sure Ollama or LM Studio is running, and that the model name in Settings matches a model you've installed. |
| Timeouts | Check your connection or proxy, or try another provider. |

For a reproducible problem, use **Settings > Export diagnostics**. The JSON report contains runtime metadata and aggregate health counts, but no API keys, chat text, filenames, workspace paths, or source code. Review it before sharing it with an issue report.

## Editor, files, and git

| Problem | Fix |
|---------|-----|
| I clicked a file but don't see it | The editor appears to the right of the **Agent** panel. Switch to 🤖 Agent to see open files. |
| Editor stuck on "Loading editor..." | Make sure you're on the latest version. Earlier builds loaded the editor from a CDN that the app blocked. |
| Go to definition or rename is basic in Python/Go/Rust/C/C++/C# | Install the matching language server (`pyright-langserver`, `gopls`, `rust-analyzer`, `clangd`, or `csharp-ls`) and keep it on `PATH`, or set the matching `VD_AGENT_LSP_*` command in `.env.local`. Without it, VD falls back to exact workspace text search. |
| "Not a git repository" | Run `git init` in the workspace, or open a folder that is a git repository. |
| Push rejected | Pull first (`git pull --rebase`), then push. |

## Chat history

| Problem | Fix |
|---------|-----|
| A chat is missing after restart | A chat is saved once you've sent at least one message. Open **Sessions**, clear the search, and check pinned items. Files are in `<user data>/conversations/`. |
| A chat file is corrupt | VD tries the last-known-good `.bak` automatically. Keep both files for diagnosis; import an exported copy or remove the bad pair only if recovery fails. |
| I need to undo an agent edit | Open **Sessions** and use **Restore** on the chat's latest checkpoint. Command and Git side effects may require Git or a manual rollback. |
| An update is never found | Development builds do not update. A private GitHub repository also cannot serve anonymous client updates; use a public release feed or install the new version manually. |

## Building

| Problem | Fix |
|---------|-----|
| Type errors | Run `npm run lint` and fix what it reports. |
| The build script stops at tests | Run `npm test`. The scripts refuse to package with failing tests. |
| Windows signing fails extracting `winCodeSign` with a symbolic link error | Enable Windows Developer Mode or run the terminal as Administrator, then build again. |
| The app uses the default Electron icon | Add `build/icon.ico`, `build/icon.icns`, and `build/icon.png` (512×512). See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md). |
| `npm run smoke` fails to open a window on Linux CI | It needs a display. Run it under `xvfb-run`. |

Still stuck? [Open an issue](https://github.com/virrdhiman/desktop-agent/issues) with your OS, VD Agent version, the exact error, and the optional private diagnostics report. Leave API keys out of screenshots and logs.
