<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license MIT
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
