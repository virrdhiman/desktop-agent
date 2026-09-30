<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license MIT
-->

# Architecture

A technical overview of VD Agent for contributors and maintainers.

**Author:** Virender Dhiman
**License:** MIT

## Overview

VD Agent is an **Electron + React + TypeScript + Vite** desktop app built on Electron's usual three layers:

```
┌──────────────────────────────────────────────────────────┐
│ Main process (Node.js) — electron/                        │
│  main.ts: window, CSP, registers handler modules          │
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
└──────────────────────────────────────────────────────────┘
```

## Security model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer only reaches Node through `window.api`.
- A Content-Security-Policy header is set on every response (looser in dev for Vite HMR).
- API keys live in `<userData>/settings.json`, encrypted with `safeStorage` when available. The renderer holds decrypted keys in memory so it can pass them to `ai:chat`.
- Keys never appear in chat history. `conversationStore.redactSecrets` removes configured keys and common key formats before writing. Settings exports strip keys (`withoutApiKeys`).
- The `/models` cache is keyed by a SHA-256 digest of the key, not the key itself. Provider error bodies have the key redacted before they reach the UI.

## Chat request flow

```
AgentChat.sendMessage
  → buildProviderChain(active first, then official free providers with keys, max 4)
  → for each provider: window.api.aiChat({ ..., autoSelect: !pinnedModel })
      main: listProviderModels(/models, 8 s timeout, 10 min cache)
            → buildModelAttemptList(ranked discovered models…, configured model)
            → for each model: POST /chat/completions (SSE stream → 'ai:stream' events)
                 classifyModelError:
                   'retry-model' (404/429/503/overload/capacity/unsupported…) → next model
                   'auth' (401, invalid key…)                                 → stop everything
                   'other' (400 bad request, network…)                        → next provider
  → on success: applyDiscoveredModel persists the working model unless the user pinned one
  → tool loop: parse ```tool blocks → window.api.toolExecute → feed results back
               (max 10 rounds; Stop sets cancelRequested and calls ai:cancel)
```

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
| `electron/main.ts` | BrowserWindow, CSP, handler registration |
| `electron/preload.ts` | `window.api` bridge and `ElectronAPI` types |
| `electron/handlers/ai.ts` | `ai:chat`, `ai:listModels`, `ai:cancel` |
| `electron/handlers/conversations.ts` | `conversations:save/list/delete` |
| `electron/conversationStore.ts` | Disk format, validation, redaction |
| `electron/handlers/settings.ts` | Provider catalog, `settings:load/save`, key encryption |
| `electron/handlers/tools.ts` | `tool:execute` for every entry in `AGENT_TOOLS` |
| `src/components/AgentChat.tsx` | System prompt, fallback loop, tool loop, markdown rendering |
| `src/lib/providers.ts` | Provider categories, fallback chain, model persistence, export/import |
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
- `src/__tests__/*`: store and component tests.

## Performance notes

- Only the last 20 non-system messages are sent with each request.
- Streaming tokens are appended to store state as they arrive.
- `/models` results are cached for 10 minutes per provider and key.
- Chat saves are debounced so a burst of messages produces one write.
