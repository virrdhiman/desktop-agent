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
│  handlers/tools.ts: agent tool implementations            │
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

## Security model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer only reaches Node through `window.api`.
- A Content-Security-Policy header is set on every response (looser in dev for Vite HMR).
- `setWindowOpenHandler` denies every new window and opens `http(s)` links in the default browser. `will-navigate` blocks navigation away from the app page (`electron/navigation.ts`).
- API keys live in `<userData>/settings.json`, encrypted with `safeStorage` when available. The renderer holds decrypted keys in memory so it can pass them to `ai:chat`.
- Keys never appear in chat history. `conversationStore.redactSecrets` removes configured keys and common key formats before writing. Settings exports strip keys (`withoutApiKeys`).
- The `/models` cache is keyed by a SHA-256 digest of the key, not the key itself. Provider error bodies have the key redacted before they reach the UI.

## Chat request flow

```
AgentChat.sendMessage
  → buildSystemPrompt(rules + buildContext(workspace, open file)) + buildHistory(budgeted, tool blocks collapsed)
  → buildProviderChain(active first, then official free providers with keys, max 4;
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
               → window.api.toolExecute({ name, args, workspace })
                   main: resolveToolArgs (relative paths → workspace), formatCommandResult
               → formatToolResult (succeeded/FAILED, args, error, hint, truncation) → followUpMessage
               (max 10 rounds; Stop sets cancelRequested and calls ai:cancel)
  → final reply: assessResponse (empty / filler-only / repetition → one correctionMessage retry)
                 unverifiedClaims (claims edits, commands, or passing tests with no matching
                   tool run this request → one unverifiedClaimsMessage retry, else a notice)
                 → cleanResponse (strips stock openers and closers outside code) → chat
```

The reply shown and sent back to the model is the complete content returned by `ai:chat`, not the streamed copy, which can still be missing its last tokens when the IPC reply arrives.

Anthropic uses the Messages API (`/v1/messages`) with the system prompt in the `system` field. There is no model discovery for it.

### Model ranking (`src/lib/modelSelect.ts`)

1. `isUsableChatModel` drops embeddings, rerank, moderation/guard, audio, speech, TTS, transcription, realtime, image, and video models, plus legacy completion-only IDs.
2. `scoreModel` assigns a quality tier by known model family. It falls back to parameter count (for example `70b`), caps small variants of strong families, and adjusts for efficiency: bonuses for coder/instruct/flash/turbo, penalties for preview/experimental, reasoning-heavy, and nano variants.
3. `rankModels` keeps only `:free` IDs when a provider lists them (OpenRouter free keys).
4. `buildModelAttemptList` returns up to 6 attempts, with the configured model last.

## Chat history persistence

- **Renderer** (`src/store/index.ts`): `addMessage`/`updateMessage` assign a stable `currentSessionId` and schedule a debounced save (`AUTOSAVE_DELAY_MS`). `newChat`, `loadSession`, and `beforeunload` flush pending saves. `deleteSession` removes the chat from memory and calls `conversations:delete`. `hydrateSessions` runs on startup and restores the latest chat.
- **Main** (`electron/conversationStore.ts`): one file per session at `<userData>/conversations/<id>.json`, with `{ version, id, title, createdAt, updatedAt, messages }`.
  - IDs are validated (`[A-Za-z0-9_-]`) so they can't escape the folder.
  - Writes are atomic: write to a temp file, then rename.
  - Only `id`, `role`, `content`, and `timestamp` are stored for each message.
  - Legacy `{ messages, taskId }` files are normalized. Corrupt files are skipped.

## Main modules

| File | Responsibility |
|------|----------------|
| `electron/main.ts` | BrowserWindow, CSP, external link handling, handler registration |
| `electron/navigation.ts` | `isExternalWebUrl`, `isSameAppPage` |
| `electron/preload.ts` | `window.api` bridge and `ElectronAPI` types |
| `electron/handlers/ai.ts` | `ai:chat`, `ai:listModels`, `ai:cancel` |
| `electron/handlers/conversations.ts` | `conversations:save/list/delete` |
| `electron/conversationStore.ts` | Disk format, validation, redaction |
| `electron/handlers/settings.ts` | Provider catalog, `settings:load/save`, key encryption |
| `electron/handlers/tools.ts` | `tool:execute` for every entry in `AGENT_TOOLS` |
| `src/components/AgentChat.tsx` | System prompt, fallback loop, tool loop, markdown rendering |
| `src/lib/providers.ts` | Provider categories, fallback chain, model persistence, export/import |
| `src/lib/agent.ts` | System prompt, context, history, tool-call parsing and result formatting, response cleanup, user-facing failure messages |
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
- `src/__tests__/sessions.test.ts`: auto-save debounce, stable session IDs, new chat, load, delete, startup restore.
- `electron/__tests__/conversationStore.test.ts` (node environment): disk round-trip, in-place updates, delete, path safety, corrupt and legacy files, secret redaction.
- `src/lib/agent.test.ts`: the prompt's answer-quality rules, context and history building, tool-call parsing, failure hints, filler stripping, junk detection, unverified-claim detection, and failure messages with next steps.
- `src/lib/highlight.test.ts`: highlighting never leaks markup into code.
- `electron/__tests__/toolSupport.test.ts`: workspace path resolution and command exit-code, timeout, and output handling.
- `electron/__tests__/navigation.test.ts`: which links open externally and which navigations are allowed.
- `electron/__tests__/tools-logic.test.ts`: file system, search, provider, and git helper logic.
- `src/__tests__/*`: store and component tests.
- `npm run smoke` (`scripts/smoke.mjs`): builds the app, then launches it three times with a temporary user data folder and workspace, driving it over the Chrome DevTools Protocol. It checks rendering, the preload API and sandbox, settings and conversation IPC, chat persistence across restarts, key redaction, the Monaco editor, link handling, and path-traversal rejection. The third launch points two providers at a local mock server (one always rate limited) and checks the agent end to end: the prompt rules, tool failures and malformed tool calls reaching the model, workspace-relative paths, sticky fallback with a notice, filler stripping, an empty reply trying the next model and then getting one corrective retry, a reply that claims edits and passing tests with no tool call being challenged instead of shown, and the all-providers-failed message. It saves screenshots and never touches your real user data. Use `--exe <path>` to test a packaged build.

## Performance notes

- Each request sends at most the last 20 non-system messages and about 40,000 characters of history. Old tool blocks are collapsed to one-line notes, and tool results are capped at about 12,000 characters.
- Streaming tokens are appended to store state as they arrive.
- `/models` results are cached for 10 minutes per provider and key.
- Chat saves are debounced so a burst of messages produces one write.
