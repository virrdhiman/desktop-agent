<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Privacy and Local Data

VD Agent has no VD-hosted server or account, and it does not send telemetry, analytics, crash reports, chats, or tool traces to the maintainer. Installed builds can check the configured release host for updates when automatic updates are enabled; this is off by default while the release repository is private.

## What is stored, and where

Everything is stored in your user data folder:

| OS | Folder |
|----|--------|
| Windows | `%APPDATA%\VD Agent` |
| macOS | `~/Library/Application Support/VD Agent` |
| Linux | `~/.config/VD Agent` |

| Data | Location | Notes |
|------|----------|-------|
| Chats | `conversations/<id>.json` | One file per chat plus a last-known-good `.bak`. Messages, task state, workspace state, recent tool outcomes, and resume context are saved automatically. Configured API keys and common key formats (`sk-…`, `gsk_…`, `AIza…`, `hf_…`, and others) are replaced with `[redacted-key]` before writing. |
| Recovery checkpoints | `checkpoints/<session-id>/` | Bounded pre-edit copies made before agent file writes and deletes; the newest 20 are retained per session. |
| Project memory | `project-memory/` | A local summary and fingerprint of repository metadata used to rebuild useful context after restart. |
| Settings | `settings.json` | Provider list, base URLs, models, active provider, local routing outcomes, custom rules, permission mode, update preference, and workspace folder. |
| API keys | `settings.json` | Encrypted with the OS keychain through Electron `safeStorage` when it is available: DPAPI on Windows, Keychain on macOS, and the Secret Service or KWallet on Linux. On Linux without a keyring, keys are stored **unencrypted**. |
| Browser data | Other folders in the same directory | Standard Electron/Chromium files such as caches and local storage. |

Settings exports never include API keys. Imports keep the keys already stored on the machine.

## What leaves your machine

VD Agent only sends data when you use a feature that needs a network service:

| When | Where | What is sent |
|------|-------|--------------|
| You chat with the agent | The active provider's base URL, and fallback providers with keys | Your messages, recent chat history, the system prompt with your custom rules, and file contents or command output the agent reads |
| Model discovery | The same provider's `/models` endpoint | Your API key |
| `web_search` tool | DuckDuckGo | The search query |
| `speech_to_text` tool | Groq or Hugging Face, with your key | The audio file |
| `image_analysis` tool | Google Gemini, with your key | The image |
| `generate_image`, `text_to_speech`, `generate_video` tools | Pollinations | The prompt or text, as part of a URL |
| Web3 tools | Public blockchain RPC endpoints and IPFS gateways | Addresses, CIDs, or content you ask about |
| Update check | The configured GitHub release host or public update feed | App version, platform, and the ordinary network metadata involved in an HTTPS request. Update checks can be disabled in Settings. |
| You click a link | Your default browser | Nothing from VD Agent; the page opens outside the app |

Tools only run when the agent calls them. Tool calls appear in the agent's reply, and each call and its result is recorded in the **Tasks** panel. With a local provider such as Ollama and no web tools, nothing leaves your machine.

Each AI provider handles your data under its own terms and privacy policy. **Community proxies are run by unknown third parties and see everything you send.**

## The agent can read your files

To do its job, the agent reads files in your workspace and sends relevant parts to your AI provider. Don't open folders that contain secrets you don't want to share with that provider, such as `.env` files with production credentials, or use a local model for sensitive projects. See [SECURITY.md](./SECURITY.md).

## Deleting your data

- **One chat**: delete it from the **Sessions** panel or the **History** popover. Its conversation, backup, and session checkpoints are removed from disk.
- **One key**: clear it in Settings and click **Save**.
- **Everything**: quit VD Agent and delete the user data folder, including conversations, backups, checkpoints, project memory, settings, and keys.
