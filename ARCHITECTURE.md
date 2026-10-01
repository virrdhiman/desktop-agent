<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Architecture

A technical overview of VD Agent for contributors and maintainers.

**Author:** [Virender Dhiman](https://virender.in)
**License:** [VD Agent License](./LICENSE) (proprietary, free to use with credit)

## Overview

VD Agent is an **Electron + React + TypeScript + Vite** desktop app built on Electron's usual three layers:

```
┌──────────────────────────────────────────────────────────┐
│ Main process (Node.js) — electron/                        │
│  main.ts: window, CSP, link handling, handler modules     │
│  navigation.ts: which URLs open externally / in-app       │
│  handlers/ai.ts: streaming chat, model discovery, cancel  │
│  handlers/conversations.ts + conversationStore.ts         │
│  handlers/settings.ts: provider catalog, encrypted keys   │
│  handlers/tools.ts: agent tools + enforced permission gate │
│  archiveStore.ts, diagnostics.ts, checkpoint/project memory │
│  handlers/fs.ts, git.ts, terminal.ts (node-pty), shell.ts │
└────────────────────────┬─────────────────────────────────┘
                         │ ipcMain.handle / ipcRenderer.invoke
┌────────────────────────┴─────────────────────────────────┐
│ Preload — electron/preload.ts                             │
│  contextBridge → window.api (typed as ElectronAPI)        │
│  invoke timeouts (10 min for ai:chat, 30 s otherwise)     │
│  event subscriptions (ai:stream, terminal:data) that      │
│  return unsubscribe functions                             │
└────────────────────────┬─────────────────────────────────┘
                         │ window.api.*
┌────────────────────────┴─────────────────────────────────┐
│ Renderer (React) — src/                                   │
│  components/: AgentChat, SettingsPanel, SessionsPanel,    │
│    CodeEditor (Monaco), MultiTerminal (xterm), GitPanel…  │
│  store/index.ts: Zustand store incl. session auto-save    │
│  lib/modelSelect.ts, lib/providers.ts: pure logic, tested │
│  lib/brand.ts: app name, version, author and repo links   │
│  lib/monacoEditor.ts: locally bundled Monaco + workers    │
└──────────────────────────────────────────────────────────┘
```

## Build output

`npm run build` runs `tsc`, then Vite with `vite-plugin-electron`:

- `dist/`: the renderer. Monaco and its workers are bundled locally (Vite `?worker` imports plus `loader.config({ monaco })`) because the CSP blocks CDN scripts. The editor chunk is lazy-loaded.
- `dist-electron/main.js`: the main process as ESM (`package.json` has `"type": "module"`). `__dirname` is derived from `import.meta.url`.
- `dist-electron/preload.cjs`: the preload as CommonJS, because sandboxed preload scripts can't be ES modules.

electron-builder packages these into `release/` using the `build` section of `package.json`. `LICENSE` is shown by the NSIS installer and copied next to the app as `LICENSE.txt`. The platform scripts (`Win/build.bat`, `Mac/build.sh`, `Linux/build.sh`) wrap the whole flow; see [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).

electron-builder does not rebuild native dependencies a second time. `node-pty` ships Windows/macOS Node-API prebuilds and its npm install step builds the Linux binary; the real Electron smoke gate creates a PTY so a missing or incompatible native module fails before release.

## Security model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer only reaches Node through `window.api`.
- A Content-Security-Policy header is set on every response (looser in dev for Vite HMR).
- `setWindowOpenHandler` denies every new window and opens `http(s)` links in the default browser. `will-navigate` blocks navigation away from the app page (`electron/navigation.ts`).
- API keys live in `<userData>/settings.json`, encrypted with `safeStorage` when available. The renderer holds decrypted keys in memory so it can pass them to `ai:chat`.
- Keys never appear in chat history. `conversationStore.redactSecrets` removes configured keys and common key formats before writing. Settings exports strip keys (`withoutApiKeys`).
- The `/models` cache is keyed by a SHA-256 digest of the key, not the key itself. Provider error bodies have the key redacted before they reach the UI.
- File writes and deletes must resolve inside the open workspace. `toolPolicy.ts` classifies tool risk in the main process and obtains native confirmation according to the saved permission mode.
- File mutations create a bounded pre-edit checkpoint before execution. This does not make shell or Git side effects reversible.
- Renderer permission requests are denied by default. Packaged update checks use electron-updater's HTTPS and SHA-512 integrity path and can be disabled; certificate-backed package signing is configured separately at release time.

## Chat request flow

```
AgentChat.sendMessage
  → buildSystemPrompt(rules + buildContext(workspace, open file, project memory, resume state))
      + buildHistory(budgeted, tool blocks collapsed)
  → shouldUseTeamMode(Normal / Smart / Agentic)
      when enabled: Prompt Analyst read-only call
                    → optional dynamic specialist calls (budget/preset-capped)
                    → optimized prompt + advisory brief for Executor
  → buildProviderChain(active first, then locally ranked official free providers with keys, max 4;
                       the provider that already answered this request moves to the front)
  → for each provider: window.api.aiChat({ ..., autoSelect: !pinnedModel })
      main: listProviderModels(/models, 8 s timeout, 10 min cache)
            → buildModelAttemptList(ranked discovered models…, configured model)
            → for each model: POST /chat/completions (SSE stream → 'ai:stream' events)
                 classifyModelError:
                   'retry-model' (404/429/503/overload/capacity/unsupported,
                                  per-model max_tokens cap, terms not accepted) → next model
                   'auth' (401, invalid key…)                                 → stop everything
                   'other' (400 bad request, network…)                        → next provider
                 tryModels: a blank reply also moves to the next model (kept if it is the last);
                 when every model fails, the first real error is reported, e.g. the rate limit
  → on success: applyDiscoveredModel persists the working model unless the user pinned one;
                a chat notice names the fallback provider (once per request)
  → on failure: describeAuthFailure / describeProviderFailure (every provider tried + next steps)
  → tool loop: parseToolCalls (parse errors go back to the model)
               → window.api.toolExecute({ name, args, workspace, sessionId, taskId })
                   main: assessToolPolicy → native approval when required
                         → createCheckpoint for file mutations
                         → resolveToolArgs (relative paths → workspace), formatCommandResult
               → formatToolResult (succeeded/FAILED, args, error, hint, truncation) → followUpMessage
               (max 10 rounds; Stop sets cancelRequested and calls ai:cancel)
  → final reply: assessResponse (empty / filler-only / repetition → one correctionMessage retry)
                 unverifiedClaims (claims edits, commands, or passing tests with no matching
                   tool run this request → one unverifiedClaimsMessage retry, else a notice)
                 when Agentic environment is enabled:
                   Reviewer receives original request + analyst brief + bounded tool-result evidence
                   → optional focused Executor repair prompt → second review
                   → Verifier synthesis (discarded if it is unusable or adds unverified claims)
                 → cleanResponse (strips stock openers and closers outside code) → chat
```

The reply shown and sent back to the model is the complete content returned by `ai:chat`, not the streamed copy, which can still be missing its last tokens when the IPC reply arrives.

Each role pass also writes a structured trace entry into the active task. The Tasks panel renders those entries as an expandable Agent trace with role input, output, provider, status, and bounded evidence.

Anthropic uses the Messages API (`/v1/messages`) with the system prompt in the `system` field. There is no model discovery for it.

### Model ranking (`src/lib/modelSelect.ts`)

1. `isUsableChatModel` drops embeddings, rerank, moderation/guard, audio, speech, TTS, transcription, realtime, image, and video models, plus legacy completion-only IDs.
2. `scoreModel` assigns a quality tier by known model family. It falls back to parameter count (for example `70b`), caps small variants of strong families, and adjusts for efficiency: bonuses for coder/instruct/flash/turbo, penalties for preview/experimental, reasoning-heavy, and nano variants.
3. `rankModels` keeps only `:free` IDs when a provider lists them (OpenRouter free keys).
4. `rankModelsWithPerformance` uses local success, latency, and task-type history to break close quality choices without allowing weak models to overtake substantially stronger ones.
5. `buildModelAttemptList` returns up to 6 attempts, with the configured model last.

## Chat history persistence

- **Renderer** (`src/store/index.ts`): `addMessage`/`updateMessage` assign a stable `currentSessionId` and schedule a debounced save (`AUTOSAVE_DELAY_MS`). A periodic flush and visibility handler reduce loss on abnormal shutdown. `newChat`, `loadSession`, and `beforeunload` flush pending saves. `hydrateSessions` runs on startup and restores the latest chat's complete resume state.
- **Main** (`electron/conversationStore.ts`): schema v2 stores one file per session at `<userData>/conversations/<id>.json`, with messages, title/pin/summary metadata, and a sanitized `resume` object containing workspace, file, task, terminal, tool, model, project-memory, checkpoint, verification, and Git state.
  - IDs are validated (`[A-Za-z0-9_-]`) so they can't escape the folder.
  - Writes are atomic and serialized per conversation: write to a unique temp file, preserve the prior valid file as `.bak`, then rename.
  - Keys and common key patterns are redacted from messages and nested resume state.
  - Legacy `{ messages, taskId }` and v1 files are normalized. A corrupt primary file falls back to `.bak`.

## Main modules

| File | Responsibility |
|------|----------------|
| `electron/main.ts` | BrowserWindow, CSP, external link handling, handler registration |
| `electron/navigation.ts` | `isExternalWebUrl`, `isSameAppPage` |
| `electron/preload.ts` | `window.api` bridge and `ElectronAPI` types |
| `electron/handlers/ai.ts` | `ai:chat`, `ai:listModels`, `ai:cancel` |
| `electron/handlers/conversations.ts` | Save/list/update/delete/import/export conversation IPC |
| `electron/conversationStore.ts` | Disk format, validation, redaction |
| `electron/handlers/settings.ts` | Provider catalog, `settings:load/save`, key encryption |
| `electron/handlers/tools.ts` | `tool:execute` for every entry in `AGENT_TOOLS` |
| `electron/toolPolicy.ts` | Workspace boundaries, tool risk classification, approval details |
| `electron/archiveStore.ts` | Validated ZIP inventory and bounded, path-safe extraction |
| `electron/diagnostics.ts` | Privacy-redacted local runtime and storage diagnostics |
| `electron/handlers/diagnostics.ts` | User-initiated diagnostics JSON export IPC |
| `electron/checkpointStore.ts` | Bounded pre-edit snapshots and restore |
| `electron/projectMemoryStore.ts` | Deterministic local repository summary and fingerprint |
| `electron/handlers/workspaceState.ts` | Project-memory and checkpoint IPC |
| `electron/handlers/updates.ts` | Packaged update check, download, install, and status events |
| `src/components/AgentChat.tsx` | System prompt, fallback loop, tool loop, markdown rendering |
| `src/lib/providers.ts` | Provider categories, fallback chain, model persistence, export/import |
| `src/lib/agent.ts` | System prompt, context, history, tool-call parsing and result formatting, response cleanup, user-facing failure messages |
| `src/lib/multiAgent.ts` | Adaptive team routing, isolated role prompts, review parsing, bounded repair, and evidence-aware synthesis |
| `src/lib/highlight.ts` | Single-pass syntax highlighter for chat code blocks |
| `electron/toolSupport.ts` | Workspace-relative tool paths, `run_command` result formatting |
| `src/lib/brand.ts` | App name, version (from `package.json`), author, repo, and license links |
| `src/lib/monacoEditor.ts` | Monaco setup with local workers; lazy-loaded by `CodeEditor.tsx` |
| `scripts/smoke.mjs` | End-to-end smoke test of the built or packaged app |
| `scripts/checksums.mjs` | Writes `release/SHA256SUMS.txt` |
| `src/types/index.ts` | Shared types and `AGENT_TOOLS` (the tool list the model sees) |

## Extending

### Add an agent tool
1. Add the definition to `AGENT_TOOLS` in `src/types/index.ts`. It appears in the system prompt automatically.
2. Implement it in `electron/handlers/tools.ts` (`tool:execute` switch).
3. Document it in `TOOLS.md`.

### Add a provider
1. Add it to `DEFAULT_PROVIDERS` in `electron/handlers/settings.ts`. Existing users get it on next load.
2. If it isn't a free official chat provider, add its ID to the right list in `src/lib/providers.ts` (local, community, or image/video).
3. If it isn't OpenAI-compatible, add a branch in `electron/handlers/ai.ts`.

### Add a panel
1. Create the component in `src/components/`.
2. Add the ID to `Panel` in `src/types/index.ts` and to the sidebar list in `Sidebar.tsx`.
3. Route it in `src/App.tsx`.

## Testing

- `src/lib/*.test.ts`: model filtering and ranking, error classification, provider chain, model persistence, export/import.
- `src/__tests__/sessions.test.ts`: auto-save debounce, stable session IDs, new chat, load, delete, startup restore, and resume state.
- `electron/__tests__/conversationStore.test.ts` (node environment): v2 disk round-trip, in-place updates, backup recovery, delete, path safety, corrupt and legacy files, and nested secret redaction.
- `electron/__tests__/toolPolicy.test.ts`: permission modes, destructive tools, and workspace boundaries.
- `electron/__tests__/checkpointStore.test.ts`: snapshot limits, restore, and new-file removal.
- `electron/__tests__/projectMemoryStore.test.ts`: deterministic project summaries and refresh fingerprints.
- `src/lib/agent.test.ts`: the prompt's answer-quality rules, context and history building, tool-call parsing, failure hints, filler stripping, junk detection, unverified-claim detection, and failure messages with next steps.
- `src/lib/highlight.test.ts`: highlighting never leaks markup into code.
- `electron/__tests__/toolSupport.test.ts`: workspace path resolution and command exit-code, timeout, and output handling.
- `electron/__tests__/archiveStore.test.ts`: safe nested extraction, overwrite protection, traversal rejection, and archive-type validation.
- `electron/__tests__/diagnostics.test.ts`: exported diagnostics exclude keys, user content, filenames, and paths.
- `electron/__tests__/reliability.test.ts`: repeated and concurrent writes, backup redaction, history bounds, and malformed resume-state resilience.
- `electron/__tests__/navigation.test.ts`: which links open externally and which navigations are allowed.
- `electron/__tests__/tools-logic.test.ts`: file system, search, provider, and git helper logic.
- `src/__tests__/*`: store and component tests.
- `npm run smoke` (`scripts/smoke.mjs`): builds the app, then launches it three times with a temporary user data folder and workspace, driving it over the Chrome DevTools Protocol. It checks rendering and viewport geometry, the preload API and sandbox, native PTY startup, updater IPC, project memory, pre-edit checkpoint restore/deletion, rich restart state, key redaction, safe ZIP listing/extraction and rollback, Monaco, link handling, and path-traversal rejection. The third launch points two providers at a local mock server (one always rate limited) and checks the agent end to end: prompt rules, tool failures and malformed calls, workspace-relative paths, sticky fallback, filler stripping, empty-response recovery, unverified-claim challenges, the complete team review/repair/verifier loop, and total-provider-failure guidance. It never touches real user data; screenshots are opt-in. Use `--exe <path>` to test a packaged build.

## Performance notes

- Each request sends at most the last 20 non-system messages and about 40,000 characters of history. Old tool blocks are collapsed to one-line notes, and tool results are capped at about 12,000 characters.
- Agentic environments bind role inputs to the selected token budget. Balanced uses request 10,000 characters, context 4,000, executor candidate 10,000, and tool evidence 5,000. Cheap is tighter and disables dynamic specialists; Strong allows more context and up to two read-only specialists.
- Streaming tokens are appended to store state as they arrive.
- `/models` results are cached for 10 minutes per provider and key.
- Chat saves are debounced so a burst of messages produces one write.
