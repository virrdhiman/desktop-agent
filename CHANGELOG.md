<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Changelog

All notable changes to VD Agent are documented here.

## [Unreleased]

### VS Code bridge
- Bumped the bundled bridge to 0.4.5. Patch previews now reject stale baselines instead of overwriting newer editor edits, and per-hunk rejection handles shifted lines and CRLF files correctly. Workspace index refreshes reuse unchanged files, and OpenAI-compatible `/v1` URLs work without duplication.
- Bumped the bundled VS Code bridge to 0.4.4 with no-cost language-server completion fallback for inline suggestions, richer dependency/snippet workspace indexing, and native definition/references/rename commands exposed from the sidebar and editor context menu.

### Reliability
- Repo indexing reuses unchanged file data, excludes hidden files such as `.env`, and avoids forced rebuilds on watcher events. Bounded Vitest workers improve stability on Windows hosts.

## [1.1.0] - 2026-10-04

### Release
- Tagged releases still publish Linux, Windows, and macOS installers plus `SHA256SUMS.txt` when signing secrets are absent. Builds are signed when the secrets are present.

### Tools
- Removed tools that only returned setup steps: `web3_deploy`, `web3_contract`, `web3_ipfs`, `comfyui_workflow`, and the Runway/Kling video options. Wallet balance and explorer lookup stay. The welcome screen no longer has a Web3 tools button.

### Providers
- Removed unofficial proxies from the catalog, including gpt4free, ChatGPT-to-API, and Discord-run resellers. Saved settings drop those entries on load. Official APIs and local servers remain.

### Security
- Approval prompts show the full shell command in a scrollable window.
- Gemini image analysis sends the API key in a request header.
- Decrypted provider keys stay in the main process. The UI only learns that a key is saved.
- Packaged builds no longer read `.env.local` from beside the executable. Set `VD_AGENT_ENV_FILE` for an explicit path.

### Docs and defaults
- New installs use the Ollama model `qwen2.5-coder:7b`. Existing saved settings keep their current model.
- The terminal docs match the app: PowerShell on Windows, bash on macOS and Linux.

### Development requirements
- Node.js 22.19 or newer is required. Node.js 20 cannot install the pinned `undici` 8 release. `node-pty`'s install script is allowed explicitly, and Linux still compiles that module with node-gyp.

### Archive workflows, reliability, and diagnostics
- Added safe ZIP inventory and extraction tools with path, symlink, overwrite, entry-size, and total-expansion protections, plus checkpoint rollback for extracted files.
- Added agent guidance for inspecting every archive source and producing traceable, schema-checked CSV instead of blindly merging incompatible records.
- Added an opt-in local diagnostics export containing runtime metadata and aggregate health counts while excluding keys, chats, filenames, workspace paths, and source code.
- Hardened local persistence with unique atomic temp files and serialized writes per conversation, including stress coverage for concurrency, backups, redaction, history limits, and malformed resume metadata.
- Expanded the golden evaluation dataset to 81 mapped cases, including 20 real-user prompts, and raised the release gate to 302 unit tests and 49 Electron smoke checks.
- Added opt-in hosted eval JSONL export for LangSmith/Arize-style dashboards. It never uploads by default, writes ignored local artifacts, and documents safe environment variables without committing secrets.
- Added versioned release-note extraction plus stronger release checklist coverage for portable app QA, installer QA, update QA, checksums, and signing status.
- Reduced the lazy Monaco editor bundle by importing Monaco's ESM editor API with selected language contributions instead of the broad all-language package import.
- Tightened replies from live Groq/OpenRouter trials: provider-native and known bare-JSON tool calls are normalized and executed, generic task deflections and false context denial get one corrective retry, obvious action narration is removed, and handoff acknowledgements stay concise.
- When a provider exposes strong models, tiny fallbacks are skipped so VD can move to another strong configured free provider instead of accepting a low-quality generic answer.
- Added adaptive Multi-Agent Team Mode for normal chat: Analyst, tool-enabled Executor, evidence-based Reviewer, one bounded repair pass, and final Verifier. Specialist calls can use different configured free providers, only the Executor may mutate the workspace, malformed reviews fail safely to the executor answer, Stop is honored between roles, and the Agent header wraps its controls cleanly in split view.

### Resume, safety, and usability
- Conversation schema v2 persists workspace, task, terminal, tool, model, project-memory, verification, and checkpoint state; previous valid saves are retained as recovery backups.
- Agent file tools create bounded pre-edit checkpoints, with one-click restore from Sessions.
- Sessions can be searched, renamed, pinned, exported, and imported.
- Risky tools use native approval dialogs, and agent writes outside the open workspace are blocked in the main process.
- Older chat context receives a local rolling summary, while deterministic project memory refreshes from repository metadata and instructions.
- Provider and model routing learns locally from success, failure, task type, and latency, with cooldowns for repeatedly failing providers.
- Added verified updater wiring, update controls, code-signing-aware cross-platform CI/release workflows, and zero-vulnerability dependency upgrades (Electron 44, Vite 7, Electron Builder 26).

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
- Treats live model discovery as the source of truth when it succeeds: new models are added to the provider's saved catalog, stale/deprecated IDs are removed, and the strongest live model becomes the default.
- Retries the next model on model-not-found, unsupported, 402/404/429/503/529, overload, capacity, and quota errors. Auth failures stop immediately, with no model or provider retry.
- Persists the working model to settings unless a model is pinned in the header. The header picker and Settings panel list discovered models for the active provider.
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
- Added `npm run agent:evals`: a three-tier local agent-evaluation gate with a golden dataset, minimum unit/smoke count guards, trajectory checks, and real Electron visual smoke checks.

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

## [1.0.0] - 2026-08-22

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
