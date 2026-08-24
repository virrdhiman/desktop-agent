<!--
  @author Virender Dhiman
  @year 2025
  @project Freebuff Agent
  @license MIT
-->

# 🏗️ Architecture Deep-Dive

This document explains the technical architecture of Freebuff Agent for contributors and maintainers.

**Author:** Virender Dhiman  
**License:** MIT

## Overview

Freebuff Agent is an **Electron + React + TypeScript** desktop application that serves as an autonomous AI coding agent. It uses a **three-process architecture**:

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                       │
│  (Node.js - electron/main.ts)                       │
│  - Window management                                 │
│  - IPC handlers for all operations                   │
│  - AI API calls (streaming)                          │
│  - Tool execution (26 tools)                         │
│  - PTY terminal management                           │
│  - Git operations (simple-git)                       │
│  - File system operations                            │
│  - Web3 blockchain tools                             │
└──────────────────┬──────────────────────────────────┘
                   │ IPC (ipcMain.handle / ipcRenderer.invoke)
┌──────────────────┴──────────────────────────────────┐
│                  Preload Script                       │
│  (electron/preload.ts)                              │
│  - Context bridge (window.api)                      │
│  - Type-safe API surface                            │
│  - Event listeners (onAIStream, onTerminalData)     │
└──────────────────┬──────────────────────────────────┘
                   │ window.api.*
┌──────────────────┴──────────────────────────────────┐
│                 Renderer Process                     │
│  (React - src/)                                     │
│  - UI components (11 components)                    │
│  - Zustand state store                              │
│  - Monaco editor                                    │
│  - xterm.js terminals                              │
│  - Markdown rendering                               │
│  - Command palette                                  │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Context Isolation (Security)
- The renderer process has **no direct access** to Node.js APIs
- All communication goes through the preload bridge
- API keys are stored in Electron's `userData` directory, never exposed to renderer
- This prevents XSS attacks from accessing the filesystem

### 2. Zustand State Management
- Single source of truth for all UI state
- No prop drilling — any component can access any state slice
- Store is defined in `src/store/index.ts` with typed interface
- Supports actions (setters) and computed values (getActiveProvider)

### 3. Tool Execution Architecture
```
User message → AI model → tool call in ```tool block →
  → Renderer parses tool call → IPC to main process →
  → Main process executes (fs/git/web/web3) →
  → Result back to renderer → Fed back to AI →
  → AI continues with result (up to 5 rounds)
```

### 4. Streaming Architecture
```
AI API (SSE stream) → Main process reads chunks →
  → Sends tokens via webContents.send('ai:stream') →
  → Renderer appendStreamingContent(token) →
  → React re-renders MarkdownContent with new text
```

### 5. Provider Fallback Chain
When an API call fails:
1. Try the active provider
2. If it fails, try the next configured free provider (with an API key)
3. Up to 4 fallback attempts before giving up
4. User sees terminal entries showing which provider was tried

## File Responsibilities

### `electron/main.ts` (~1050 lines)
The heart of the application. Contains:
- Window creation and lifecycle
- 30+ IPC handlers for all operations
- 26 tool implementations in the `tool:execute` handler
- AI chat handler with streaming (OpenAI-compatible + Anthropic)
- Settings persistence to `userData/settings.json`
- Conversation history persistence to `userData/conversations/`

### `electron/preload.ts` (~130 lines)
The security bridge. Exposes `window.api` with typed methods:
- 30+ methods for file, git, terminal, tool, settings, AI operations
- Event listeners for streaming and terminal data
- Full TypeScript type definitions for the API surface

### `src/store/index.ts` (~230 lines)
Zustand store with 12 state slices:
- Workspace, Navigation, Command Palette, Layout
- File Browser, Git, Chat, Tool Results
- Tasks, Terminal, Sessions, Settings

### `src/types/index.ts` (~200 lines)
TypeScript interfaces and the `AGENT_TOOLS` constant array:
- 10 interfaces (FileEntry, GitStatus, ChatMessage, etc.)
- 26 tool definitions with names, descriptions, and parameter specs

### `src/components/AgentChat.tsx` (~1070 lines)
The largest and most complex component:
- Custom markdown parser and renderer
- Syntax highlighting (JS/TS/Python/Go/Rust)
- Tool call detection and execution loop
- @mention detection and file/folder suggestions
- Image paste and drag-drop handling
- Multi-provider fallback chain
- Plan Mode toggle
- Session management
- Token counter

## Adding New Features

### Adding a New Agent Tool
1. Add tool definition in `src/types/index.ts` → `AGENT_TOOLS` array
2. Add implementation in `electron/main.ts` → `tool:execute` switch case
3. The AI model will automatically see the new tool in its system prompt

### Adding a New Panel
1. Create component in `src/components/`
2. Add panel ID to `Panel` type in `src/types/index.ts`
3. Add to `PANELS` array in `src/components/Sidebar.tsx`
4. Add route in `src/App.tsx` panel switch

### Adding a New Provider
1. Add provider object to the default `providers` array in `electron/main.ts` → `settings:load`
2. If it has a special API format (not OpenAI-compatible), add handling in `ai:chat` handler
3. Add category ID to `COMMUNITY_IDS` or `LOCAL_IDS` in `src/components/SettingsPanel.tsx`

## State Management Flow

```
User Action (click/type)
  → Component calls store action (e.g., setActivePanel)
  → Zustand updates state
  → All subscribed components re-render
  → useEffect hooks fire (e.g., load new panel data)
  → IPC calls to main process if needed
  → Main process executes and returns result
  → Store updates with result
  → UI reflects new state
```

## Performance Considerations

- **File indexing**: `walkDirectory` recursively walks the project tree on startup (max depth 8)
- **Message limit**: Only last 20 messages sent to AI API to manage context window
- **Streaming**: Tokens are appended to state on every chunk (can be 100+ updates/second)
- **Terminal**: PTY output is buffered and sent in chunks
- **Monaco**: Lazy-loaded, only mounts when a file is selected

## Common Patterns

### IPC Handler Pattern
```typescript
ipcMain.handle('operation:name', async (_event, args) => {
  try {
    // ... do work ...
    return { success: true, data: result }
  } catch (err: any) {
    return { error: err.message }
  }
})
```

### Store Action Pattern
```typescript
actionName: (arg) => set((state) => ({
  // Update state based on current state
  field: newValue,
}))
```

### Component Pattern
```typescript
function MyComponent() {
  const { state, action } = useStore()
  const [local, setLocal] = useState(initialValue)
  
  useEffect(() => {
    // React to state changes
  }, [dependency])
  
  return <div>...</div>
}
```
