<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Changelog

All notable changes to VD Agent are documented here.

## [1.0.1] - 2026-09-30

### Branding
- Consistent **VD Agent** / **VD** branding across the app title, package metadata (`vd-agent`, `com.vd.agent`, product name `VD Agent`), build scripts, and docs.

### Agent behaviour
- Rewrote the system prompt as a senior engineering assistant. It inspects before claiming, challenges weak or risky requests, verifies with commands before reporting success, states risks and tradeoffs, and asks before destructive actions.
- Fixed the tool-call format shown to the model. It previously rendered with stray backslashes.
- Tool-call parsing tolerates CRLF and trailing whitespace. Hitting the 10-round limit is now reported in the chat.
- **Stop** cancels the in-flight request in the main process (`ai:cancel`) and skips remaining tool rounds.
- Fixed duplicated streaming tokens after switching panels. The stream listener now unsubscribes on unmount.
- System notices (errors, missing key) are no longer sent to the model as user messages.
- Tool descriptions for speech, video, and image analysis now match what the tools actually do.

### Answer quality
- The system prompt now sets explicit rules: no filler openers or closers, specific and critical answers, questions only when they change the work (at most two, each with a default), a clear report for every failed tool, and "Next steps:" when work remains.
- Tool paths now resolve against the open workspace, and `run_command` runs there by default. Previously they resolved against the app's own folder.
- `run_command` reports non-zero exits and timeouts as failures with the exit code, stdout, and stderr. Previously a failing command looked like a success, and stderr was dropped when there was stdout.
- Failed tool results reach the model labelled `FAILED`, with the arguments and a hint about the likely cause. Malformed tool blocks are reported back instead of silently ignored. Large results are truncated with a note.
- History sent to the model has a size budget, collapses earlier tool calls into short notes, and notes when the editor file in context was truncated.
- Replies are cleaned of stock openers and closers, outside code blocks only. An empty, filler-only, or looping reply gets one automatic retry, then a clear notice.
- A model that returns an empty reply (seen with reasoning models such as `gpt-oss-120b` on Groq) no longer ends the request; the next model is tried.
- A reply that claims edits, commands, or passing tests with no matching tool call in that request is challenged once, then flagged with a "Check this reply" notice.
- When every model on a provider fails, the first real error (usually the rate limit) is reported instead of the last fallback model's. Per-model `max_tokens` caps and models that need their terms accepted move on to the next model, and Orpheus text-to-speech models are no longer tried for chat.
- Fallback tells you which provider answered and stays on it for the rest of the request. When everything fails, the chat lists each provider's error with next steps. Missing-key, auth, and tool-round-limit messages also end with next steps.
- Fixed replies occasionally being cut off at the end, because the streamed copy was used instead of the complete reply.
- Fixed chat code blocks, including tool calls, showing stray highlighter markup such as `#98c379">`.

### Free API key model selection
- Discovers `/models` for OpenAI-compatible providers (8 s timeout, 10 min cache keyed by a hash of the key).
- Wider non-chat filtering: embeddings, rerank, moderation/guard, audio, speech, TTS, transcription, realtime, image, and video.
- Ranks by quality tier, then efficiency. Small variants of strong families are capped, and previews and reasoning-heavy variants are penalized. On OpenRouter, only `:free` models are used when listed.
- Retries the next model on model-not-found, unsupported, 402/404/429/503/529, overload, capacity, and quota errors. Auth failures stop immediately, with no model or provider retry.
- Persists the working model to settings unless a model is pinned in the header. The header picker lists discovered models for the active provider.
- Provider fallback uses only official free providers with keys (up to 4 total). Local servers and community proxies are never used implicitly.
- Provider error text has the API key redacted. Anthropic requests send the system prompt in the `system` field.

### Chat history
- Conversations auto-save (debounced) to `<userData>/conversations/<session-id>.json`, with a stable session ID so saves update one file.
- The latest chat is restored on startup. Sessions can be opened and deleted from the Sessions panel and the History popover. Deleting removes the file from disk.
- Atomic writes, path-safe session IDs, a tolerant loader for corrupt and legacy files, and redaction of configured API keys and common key formats.
- "Clear" is now **New chat**. The previous conversation stays in history.

### Settings and security
- Settings export no longer includes API keys. Import keeps locally stored keys.
- Providers added to the catalog appear in existing settings files automatically.
- Updated the Hugging Face endpoint (`router.huggingface.co/v1`), the Cohere OpenAI-compatible endpoint, and the Together default model.
- Toned down provider notes and marketing copy. Community proxies now show a privacy warning.

### Build and tests
- `Win/build.bat` and `Mac/build.sh`: ASCII output (fixed garbled characters), run from the repo root, read the version from `package.json`, and stop on test failures.
- Electron unit tests now run with `npm test`. Added tests for model ranking and filtering, error classification, provider chain, model persistence, settings export, the conversation store, and session auto-save.
- `.gitattributes` pins line endings for the build scripts.
- Fixed the built app failing to open a window: the ESM main process now derives `__dirname` from `import.meta.url`, and the preload is built as CommonJS (`preload.cjs`) so it loads in the sandbox.

### UI fixes
- Auto-scrolling the chat no longer pushes the chat header off-screen.
- The sidebar version is read from `package.json`.
- External links, such as provider "Get API Key" pages, open in the system browser instead of a new app window, and the app window cannot navigate away from the app.
- Fixed the code editor never loading. Monaco was fetched from a CDN that the Content-Security-Policy blocks. It is now bundled with the app (lazy-loaded), so the editor also works offline.

### License and credit
- VD Agent is now proprietary, source-available software owned by Virender Dhiman, under the new VD Agent License. It is free to download and use, including for commercial work, but credit is required and it may not be resold, redistributed, rebranded, or hosted as a service.
- Source headers, docs, and package metadata reflect the new license. `package.json` is marked `private` and points to the correct repository.
- Third-party dependencies keep their own open-source licenses and notices. Those licenses cover the dependencies only.
- The Windows installer shows the license, and packaged builds include `LICENSE.txt`.
- Settings has an About card, and the chat welcome screen credits the author, with links to [virender.in](https://virender.in) and the GitHub repository.

### Documentation and release
- Rewrote the README for users: download and install, running from source, free API key setup, privacy and local data, and a plain-language license summary.
- New `docs/` folder with install, providers, privacy, security, troubleshooting, release checklist, and contributing guides. USAGE and ARCHITECTURE now point to them instead of duplicating content.
- Added `npm run smoke`, an end-to-end check of the built or packaged app that uses a throwaway profile, and `npm run checksums`, which writes `release/SHA256SUMS.txt`.
- Added `Linux/build.sh`. All three build scripts write checksums and warn when a build is unsigned. `Win/build.bat` enables executable signing when `CSC_LINK` is set.
- `build/` is no longer git-ignored, so app icons can be committed.

## [1.0.0] - 2025-08-28

### Initial Release

#### AI Agent
- Autonomous coding agent with streaming responses and tool calls for files, git, code search, web search, Web3, and media
- Multi-provider fallback
- Plan Mode (plan before executing)
- Multi-round tool execution
- @context mentions (@file, @folder, @web)
- Image paste (Ctrl+V) and drag-and-drop
- Token/cost estimates per provider
- Diff viewer for agent file edits
- Model quick-switch dropdown in the chat header
- Stop generation button
- Session save/load/export

#### AI Providers
- Provider catalog grouped as free, local, community, image/video, and paid
- API key encryption via the OS keychain (`safeStorage`)
- Provider search and filter in Settings
- Settings import/export

#### Code Editor
- Monaco editor with syntax highlighting
- Multi-tab editing, save and close
- Lazy-loaded

#### Git Integration
- Status, diff (unified and split view), commit, push, pull
- Branch manager (create, switch, delete)
- Stash operations

#### Terminal
- Multi-tab PTY terminal
- Integrated bottom panel with `Ctrl+`` toggle

#### File System
- File browser with directory tree
- Create/delete files, file and content search

#### UI/UX
- Dark theme
- Command palette (Ctrl+P)
- Keyboard shortcuts for panels
- ARIA labels and keyboard navigation

#### Security
- Content Security Policy headers
- API key encryption at rest
- Context isolation and sandboxed renderer

#### Developer Experience
- TypeScript strict mode
- Vitest unit and integration tests
- electron-builder packaging (NSIS, DMG, AppImage)
- Build scripts for Windows (.bat) and macOS (.sh)

### Built With
- Electron 31
- React 18
- TypeScript 5.5
- Vite 5.4
- Zustand 4.5
- Monaco Editor 0.50
- xterm.js 5.3
- simple-git 3.25
