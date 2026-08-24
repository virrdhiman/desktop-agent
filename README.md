<!--
  @author Virender Dhiman
  @year 2025
  @project Freebuff Agent
  @license MIT
-->

# Freebuff Agent 🤖

> A Cursor-like AI coding agent desktop app with **44 AI providers**, **33 autonomous tools**, Web3 blockchain integration, and a full development environment — all **open source** and mostly **free**.
>
> **Author:** Virender Dhiman  
> **License:** MIT  
> **Year:** 2025

![Electron](https://img.shields.io/badge/Electron-31-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tools](https://img.shields.io/badge/Tools-33-green)
![Providers](https://img.shields.io/badge/Providers-44-orange)
![Tests](https://img.shields.io/badge/Tests-65-brightgreen)

---

## ✨ Features

### 🤖 Autonomous Agent
- AI reads files, edits code, runs commands, manages git — all autonomously
- **33 built-in tools** including file ops, git, web search, image/video generation, speech-to-text, and Web3 blockchain
- **Multi-round tool execution** (up to 5 rounds of tool → result → follow-up)
- **Streaming responses** — tokens appear in real-time
- **Auto-fallback** — if one AI provider fails, tries the next free one automatically
- **Plan Mode** — toggle to have the agent plan changes before executing
- **Custom Rules** — write your own system prompts for coding style/conventions

### ⌨️ Command Palette
- **Ctrl+P** — Fuzzy file search across your entire workspace
- **Ctrl+Shift+P** — Command palette for all actions
- Navigate panels, toggle features, git operations — all from one search bar

### 📝 Code Editor
- Monaco Editor (VS Code's editor) with 50+ language syntax highlighting
- Tabs, minimap, bracket matching, code folding
- **Ctrl+S** to save, **Ctrl+W** to close tabs
- File dirty indicator (unsaved changes dot)

### ⬛ Integrated Terminal
- **Multi-tab terminal** with add/remove tabs
- Real PTY shells (PowerShell on Windows, bash on Mac/Linux)
- xterm.js with web links addon

### 🔀 Git Manager
- Full git status, diffs, commit, push, pull
- **Branch Manager** — create, switch, delete branches
- **Stash management** — stash/pop changes
- **Syntax-highlighted diff viewer** — unified + split view with color-coded lines
- **AI commit message generation** — agent reads your diff and writes the commit message
- **Undo last commit** / **Discard changes** tools

### 📋 Task Tracker
- Every agent action tracked with timestamps
- Tool calls, results, and errors visible
- Expand/collapse individual tasks

### 🗂️ File Browser
- Tree-view file navigation
- Click to open in Monaco editor
- Create files and directories

### 💾 Session Management
- Save conversation history to disk
- Load previous sessions
- Sessions persist across app restarts

### 📋 Plan Mode
- Toggle in chat header
- Agent plans changes in detail before executing
- Review the plan, then approve to proceed

### 🎨 Markdown Rendering
- Code blocks with syntax highlighting (JS/TS/Python/Go/Rust)
- Tables, headers, bold, inline code
- Professional formatting in all agent responses

### 📎 Image & File Support
- **Ctrl+V** — paste screenshots into chat
- **Drag & drop** — drag files from desktop
- **📎 button** — attach images
- Thumbnail previews with remove option

### 🌐 @Context Mentions
- Type `@` in chat to reference files, folders, or trigger web search
- `@filename` — reference a specific file
- `@folder` — reference a directory
- `@web` — trigger a web search

### 📊 Token Counter
- Shows approximate tokens, characters, and message count in the input area

### ⏹ Stop Generation
- Red "Stop" button while streaming — cancel mid-response immediately

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | File search / Command palette |
| `Ctrl+Shift+P` | Commands only |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| `Ctrl+`` ` | Toggle terminal |
| `Ctrl+G` | Go to Git |
| `Ctrl+B` | Go to Files |
| `Ctrl+Shift+A` | Go to Agent |

---

## 🛠️ Agent Tools (33)

The agent has autonomous access to these tools:

| Category | Tools |
|----------|-------|
| **File System** | `read_file`, `write_file`, `edit_file`, `create_file`, `delete_file`, `list_files`, `search_files`, `search_code` |
| **Commands** | `run_command` |
| **Project** | `read_directory_tree`, `multi_file_edit` |
| **Git** | `git_status`, `git_diff`, `git_commit`, `git_log`, `git_branch`, `git_stash`, `git_generate_commit`, `git_undo_last`, `git_discard_changes` |
| **Web** | `web_search` |
| **Image** | `generate_image`, `image_analysis` |
| **Video** | `generate_video` |
| **Speech** | `speech_to_text`, `text_to_speech` |
| **Web3** | `web3_balance`, `web3_explorer`, `web3_ipfs`, `web3_contract`, `web3_deploy` |

See [TOOLS.md](./TOOLS.md) for the complete tools reference with examples.

---

## 🆓 AI Providers (44)

### Free Official (16)
| Provider | Models | Rate Limit | Key |
|----------|--------|------------|-----|
| **Groq** ⚡ | llama-3.3-70b | 30 req/min | [Get Key](https://console.groq.com/keys) |
| **Cerebras** 🧠 | llama-3.3-70b (20x faster) | $5 credits | [Get Key](https://cloud.cerebras.ai/) |
| **SambaNova** 🟣 | Llama-3.3-70B | Generous | [Get Key](https://cloud.sambanova.ai/apis) |
| **Hugging Face** 🤗 | 1000+ models | Free tier | [Get Key](https://huggingface.co/settings/tokens) |
| **DeepSeek** 🔍 | deepseek-chat | Free tier | [Get Key](https://platform.deepseek.com/api_keys) |
| **Google Gemini** ✨ | gemini-2.0-flash | 15 req/min | [Get Key](https://aistudio.google.com/apikey) |
| **GitHub Models** 🐙 | gpt-4o-mini | 15 req/min | [Get Key](https://github.com/settings/tokens) |
| **OpenRouter** 🌐 | Many free models | Varies | [Get Key](https://openrouter.ai/keys) |
| **Mistral AI** 🌊 | mistral-small | Free tier | [Get Key](https://console.mistral.ai/api-keys/) |
| **Together AI** 🤝 | 200+ open-source | $1 credits | [Get Key](https://api.together.xyz/settings/api-keys) |
| **Fireworks AI** 🔥 | Llama, Mixtral | $1 credits | [Get Key](https://fireworks.ai/account/api-keys) |
| **DeepInfra** 🌌 | Llama, Mistral | $1 credits | [Get Key](https://deepinfra.com/dash/api_keys) |
| **SiliconFlow** 🇨🇳 | Qwen, DeepSeek | Free tier | [Get Key](https://cloud.siliconflow.cn/account/ak) |
| **xAI (Grok)** 🚀 | Grok-2 | $25 credits | [Get Key](https://console.x.ai/) |
| **Novita AI** 🎯 | Llama, Mixtral | Free tier | [Get Key](https://novita.ai/settings/api-keys) |

### Local (3) — Always Free & Private
| Provider | Install |
|----------|---------|
| **Ollama** 🏠 | [ollama.com](https://ollama.com/download) |
| **LM Studio** 💻 | [lmstudio.ai](https://lmstudio.ai/) |
| **llama.cpp Server** 📦 | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |

### Community (15) — Free via Discord
| Provider | Users | Key Models |
|----------|-------|------------|
| **gpt4free (g4f)** 🏴‍☠️ | 12K+ ⭐ | GPT-4, Claude, Gemini |
| **Pollinations** 🌻 | 500+ projects | Text, image, video |
| **Zukijourney** 🌐 | 8,058 | GPT-4.1, Claude-3.5 |
| **ElectronHub** ⚡ | 5,898 | GPT-4.1, Gemini |
| **VoidAI** 👻 | 2,089 | GPT-4.1, Claude-3.5 |
| **NagaAI** 🐉 | 3,582 | Claude-3.5 |
| **HelixMind** 🔮 | 2,651 | TTS, STT, LLM |
| **NavyAPI** 🚢 | 1,543 | GPT-4.1, DeepSeek |
| **MNN** 🧊 | 479 | GPT-4.1, Flux |
| **WebraftAI** 🕸️ | 1,506 | Various |
| **VoltAI** ⚡ | 249 | DeepSeek-R1 |
| **hcap.ai** 🧢 | 219 | GPT-4.1 |
| **ZanityAI** 😈 | 1,699 | Claude-3.5 |
| **Kimetsu** 🔥 | 2,014 | Claude-3.5 |
| **ChatGPT-to-API** 🔄 | — | GPT-4 |

### Paid (4)
| Provider | Models |
|----------|--------|
| **OpenAI** 💰 | GPT-4o, o1, o3 |
| **Anthropic** 💰 | Claude Sonnet, Opus |
| **Cohere** 💰 | Command-A |
| **Perplexity** 💰 | Sonar (search-augmented) |

---

## ⛓️ Web3 / Blockchain Tools

| Tool | What it does |
|------|-------------|
| `web3_balance` | Check crypto wallet balance on 7 EVM chains (Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Sepolia) |
| `web3_explorer` | Look up transactions, addresses, blocks on Etherscan, Polygonscan, etc. |
| `web3_ipfs` | Upload or fetch content from IPFS decentralized storage |
| `web3_contract` | Verify smart contracts, get ABIs on block explorers |
| `web3_deploy` | Get Hardhat deployment instructions for smart contracts |

---

## 🚀 Quick Start

```bash
# Clone the project
git clone <repo-url>
cd "Desktop Agent"

# Install dependencies
npm install

# Start development
npm run dev
```

### Setup Steps
1. **Open Settings** (⚙️) → pick a **FREE** provider (Groq is fastest)
2. Click **"Get API Key"** → create account → copy key
3. Paste key → **Save**
4. **Open a workspace folder** (📁 Files → Open, or ⚙️ Settings → Open)
5. Go to **Agent** (🤖) and start chatting!

---

## 🏗️ Architecture

```
Desktop Agent/
├── electron/
│   ├── main.ts              # Electron main process (IPC, PTY, AI, Git, FS, Web3)
│   └── preload.ts           # Secure context bridge (typed API for renderer)
├── src/
│   ├── components/
│   │   ├── AgentChat.tsx    # AI chat with streaming, tools, markdown, @mentions
│   │   ├── CodeEditor.tsx   # Monaco editor with tabs
│   │   ├── CommandPalette.tsx # Ctrl+P file search & commands
│   │   ├── BranchManager.tsx  # Git branch management
│   │   ├── MultiTerminal.tsx  # Multi-tab PTY terminal
│   │   ├── FileBrowser.tsx    # File tree navigation
│   │   ├── GitPanel.tsx       # Git status, diff, commit, history
│   │   ├── TaskPanel.tsx      # Agent task tracking
│   │   ├── SettingsPanel.tsx  # 37 provider configuration
│   │   ├── SessionsPanel.tsx  # Conversation history
│   │   └── Sidebar.tsx        # Navigation sidebar
│   ├── store/index.ts       # Zustand state management
│   ├── types/index.ts       # TypeScript types + 26 tool definitions
│   ├── App.tsx              # Root layout + keyboard shortcuts
│   ├── main.tsx             # React entry point
│   └── index.css            # Theme & styling
├── TOOLS.md                 # Complete agent tools reference
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

### Data Flow
1. **Renderer** (React) → sends IPC message → **Preload** (bridge) → **Main Process** (Node.js)
2. **Main Process** executes tool/API call → sends result back → **Renderer** updates UI
3. **Streaming**: Main process reads SSE stream → sends tokens via `ai:stream` event → Renderer appends to message

### Security
- **Context Isolation** enabled — no `nodeIntegration`
- **Preload bridge** — only exposed APIs are accessible
- **API keys stored locally** in Electron's `userData` directory
- Keys only sent to the configured AI provider
- No telemetry, no tracking, no data collection

---

## 🧪 Testing

```bash
# Run all 65 tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## 📦 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Electron 31** | Desktop shell, native APIs |
| **React 18** | UI rendering |
| **TypeScript 5** | Type safety |
| **Zustand** | State management |
| **Vite** | Build tooling |
| **Monaco Editor** | Code editing (VS Code's editor) |
| **xterm.js** | Terminal emulation |
| **node-pty** | Real PTY terminal processes |
| **simple-git** | Git operations |
| **react-markdown** | Markdown rendering |

---

## 📄 Documentation

- [USAGE.md](./USAGE.md) — Complete how-to-use guide with examples
- [TOOLS.md](./TOOLS.md) — Complete agent tools reference with examples
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Technical deep-dive for contributors

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npx tsc --noEmit` to verify types
5. Run `npx vitest run` to run all 65 tests
6. Run `npx vite build` to verify build
7. Submit a pull request

---

## 📜 License

MIT License — use it however you want.

Copyright (c) 2025 Virender Dhiman

---

Built with ❤️ by **Virender Dhiman** ([@virenderdhiman](https://github.com/virenderdhiman))
