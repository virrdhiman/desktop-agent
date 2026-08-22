# Freebuff Agent 🤖

> A Cursor-like AI coding agent desktop app with **30+ AI providers** (most free), autonomous tool execution, streaming responses, and a full development environment.

![Electron](https://img.shields.io/badge/Electron-31-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

### 🤖 Autonomous Agent
- AI reads files, edits code, runs commands, manages git — all autonomously
- Multi-round tool execution (up to 5 rounds of tool → result → follow-up)
- Streaming responses (tokens appear in real-time)
- Task tracker shows every step the AI takes

### ⌨️ Command Palette (Ctrl+P)
- **Ctrl+P** — Fuzzy file search across your entire workspace
- **Ctrl+Shift+P** — Command palette for all actions
- Navigate with arrow keys, select with Enter

### 📝 Code Editor
- Monaco Editor (VS Code's editor) with full syntax highlighting
- Tabs, minimap, bracket matching, code folding
- **Ctrl+S** to save, **Ctrl+W** to close tabs

### ⬛ Integrated Terminal
- Multi-tab terminal with PTY (real shell, not simulated)
- PowerShell on Windows, bash on Mac/Linux
- Add/remove tabs with the + button

### 🔀 Git Manager
- Full git status, diffs, commit, push, pull
- **Branch Manager** — create, switch, delete branches
- Stash management (stash/pop changes)
- Commit history viewer

### 📋 Task Tracker
- Every agent action tracked with timestamps
- Tool calls, results, and errors visible
- Expand/collapse individual tasks

### 🗂️ File Browser
- Tree-view file navigation
- Click to open in Monaco editor
- Create files and directories

### ⚙️ 30+ AI Providers
The most comprehensive AI provider list of any desktop app:

## 🆓 Free Official Providers (15)

| Provider | Models | Rate Limit | Get Key |
|----------|--------|------------|---------|
| **Groq** ⚡ | llama-3.3-70b | 30 req/min | [console.groq.com](https://console.groq.com/keys) |
| **Cerebras** 🧠 | llama-3.3-70b (20x faster) | $5 credits | [cloud.cerebras.ai](https://cloud.cerebras.ai/) |
| **SambaNova** 🟣 | Llama-3.3-70B | Generous | [cloud.sambanova.ai](https://cloud.sambanova.ai/apis) |
| **Hugging Face** 🤗 | 1000+ models | Free tier | [hf.co](https://huggingface.co/settings/tokens) |
| **DeepSeek** 🔍 | deepseek-chat | Free tier | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| **Google Gemini** ✨ | gemini-2.0-flash | 15 req/min | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **GitHub Models** 🐙 | gpt-4o-mini | 15 req/min | [github.com](https://github.com/settings/tokens) |
| **OpenRouter** 🌐 | Many free models | Varies | [openrouter.ai](https://openrouter.ai/keys) |
| **Mistral AI** 🌊 | mistral-small | Free tier | [console.mistral.ai](https://console.mistral.ai/api-keys/) |
| **Together AI** 🤝 | 200+ open-source | $1 credits | [api.together.xyz](https://api.together.xyz/settings/api-keys) |
| **Fireworks AI** 🔥 | Llama, Mixtral | $1 credits | [fireworks.ai](https://fireworks.ai/account/api-keys) |
| **DeepInfra** 🌌 | Llama, Mistral | $1 credits | [deepinfra.com](https://deepinfra.com/dash/api_keys) |
| **SiliconFlow** 🇨🇳 | Qwen, DeepSeek | Free tier | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| **xAI (Grok)** 🚀 | Grok-2 | $25 credits | [console.x.ai](https://console.x.ai/) |
| **Novita AI** 🎯 | Llama, Mixtral | Free tier | [novita.ai](https://novita.ai/settings/api-keys) |

## 🏠 Local Providers (3) — Always Free & Private

| Provider | Notes | Install |
|----------|-------|---------|
| **Ollama** 🏠 | 100+ models | [ollama.com](https://ollama.com/download) |
| **LM Studio** 💻 | Beautiful GUI | [lmstudio.ai](https://lmstudio.ai/) |
| **llama.cpp Server** 📦 | Maximum perf | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |

## 🏴‍☠️ Community Free APIs (15)

| Provider | Users | Key Models | Source |
|----------|-------|------------|--------|
| **gpt4free (g4f)** 🏴‍☠️ | 12K+ ⭐ | GPT-4, Claude, Gemini | [GitHub](https://github.com/xtekky/gpt4free) |
| **Pollinations** 🌻 | 500+ projects | Text, image, video | [GitHub](https://github.com/pollinations/pollinations) |
| **ChatGPT-to-API** 🔄 | — | GPT-4 | [GitHub](https://github.com/acheong08/ChatGPT-to-API) |
| **Zukijourney** 🌐 | 8,058 | GPT-4.1, Claude-3.5 | Discord |
| **ElectronHub** ⚡ | 5,898 | GPT-4.1, Gemini | Discord |
| **VoidAI** 👻 | 2,089 | GPT-4.1, Claude-3.5 | Discord |
| **NagaAI** 🐉 | 3,582 | Claude-3.5 | Discord |
| **HelixMind** 🔮 | 2,651 | TTS, STT, LLM | Discord |
| **NavyAPI** 🚢 | 1,543 | GPT-4.1, DeepSeek | Discord |
| **MNN** 🧊 | 479 | GPT-4.1, Flux | Discord |
| **WebraftAI** 🕸️ | 1,506 | Various | Discord |
| **VoltAI** ⚡ | 249 | DeepSeek-R1 | Discord |
| **hcap.ai** 🧢 | 219 | GPT-4.1, DeepSeek | Discord |
| **ZanityAI** 😈 | 1,699 | Claude-3.5, DeepSeek | Discord |
| **Kimetsu** 🔥 | 2,014 | Claude-3.5 | Discord |

## 💰 Paid Providers (4)

| Provider | Models |
|----------|--------|
| **OpenAI** 💰 | GPT-4o, o1, o3 |
| **Anthropic** 💰 | Claude Sonnet, Opus |
| **Cohere** 💰 | Command-A |
| **Perplexity** 💰 | Sonar (search-augmented) |

## 🛠️ Agent Tools (16)

The agent has autonomous access to:
- `read_file` · `write_file` · `edit_file` · `create_file` · `delete_file`
- `list_files` · `search_files` · `search_code`
- `run_command`
- `git_status` · `git_diff` · `git_commit` · `git_log`
- `git_branch` · `git_stash`

## ⌨️ Keyboard Shortcuts

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

## 🚀 Quick Start

```bash
# Clone the project
cd "C:\Users\virrd\OneDrive\Desktop\PRJs\pers\Desktop Agent"

# Install dependencies
npm install

# Start development
npm run dev
```

1. Open **Settings** (⚙️)
2. Click any **FREE** provider (try Groq for fastest)
3. Click "Get API Key" → create account → copy key
4. Paste key → Save
5. Open a workspace folder
6. Go to **Agent** (🤖) and start chatting!

## 🏗️ Architecture

```
├── electron/
│   ├── main.ts          # Electron main process (IPC, PTY, AI, Git, FS)
│   └── preload.ts       # Secure context bridge
├── src/
│   ├── components/
│   │   ├── AgentChat.tsx          # AI chat with streaming + tools
│   │   ├── CodeEditor.tsx         # Monaco editor with tabs
│   │   ├── CommandPalette.tsx     # Ctrl+P file search & commands
│   │   ├── BranchManager.tsx      # Git branch management
│   │   ├── MultiTerminal.tsx      # Multi-tab PTY terminal
│   │   ├── FileBrowser.tsx        # File tree navigation
│   │   ├── GitPanel.tsx           # Git status, diff, commit
│   │   ├── TaskPanel.tsx          # Agent task tracking
│   │   ├── SettingsPanel.tsx      # 30+ provider configuration
│   │   └── Sidebar.tsx            # Navigation sidebar
│   ├── store/index.ts            # Zustand state management
│   ├── types/index.ts            # TypeScript types + tool definitions
│   ├── App.tsx                    # Main layout + keyboard shortcuts
│   └── index.css                  # Theme & styling
└── package.json
```

## 🔒 Security

- Context isolation + preload bridge (no `nodeIntegration`)
- API keys stored locally in Electron's user data directory
- Keys only sent to the configured AI provider
- No telemetry, no tracking, no data collection

---

Built with ❤️ by Freebuff
