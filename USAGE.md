<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# VD Agent Usage Guide

**Author:** [Virender Dhiman](https://virender.in)
**License:** [VD Agent License](./LICENSE) (proprietary, free to use with credit)

---

## Table of Contents

1. [Installation](#1-installation)
2. [First Launch and Setup](#2-first-launch-and-setup)
3. [Getting Your First API Key](#3-getting-your-first-api-key)
4. [Using the AI Agent](#4-using-the-ai-agent)
5. [Code Editor](#5-code-editor)
6. [Terminal](#6-terminal)
7. [Git](#7-git)
8. [File Browser](#8-file-browser)
9. [Command Palette](#9-command-palette)
10. [Chat History](#10-chat-history)
11. [Plan Mode](#11-plan-mode)
12. [Images and Files](#12-images-and-files)
13. [Web3 Tools](#13-web3-tools)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [Building the Desktop App](#15-building-the-desktop-app)
16. [Troubleshooting](#16-troubleshooting)
17. [FAQ](#17-faq)

---

## 1. Installation

### Prerequisites

- **Node.js 18+** and npm
- **Git**
- Build tools for `node-pty`: Visual Studio Build Tools (Windows) or Xcode Command Line Tools (macOS)

### Install

```bash
git clone https://github.com/virrdhiman/desktop-agent.git
cd desktop-agent
npm install
npm run dev
```

The app window opens once the dev server is ready.

---

## 2. First Launch and Setup

The layout has a **sidebar** (left) for switching panels, the **main area** for the active panel, and a collapsible **terminal** at the bottom.

| Step | Action | Where |
|------|--------|-------|
| 1 | Open Settings | ⚙️ in the sidebar |
| 2 | Pick a provider | Any free official provider (Groq or Gemini recommended) |
| 3 | Get an API key | Click "Get API Key", sign up, and copy the key |
| 4 | Save it | Paste it into the API key field and click Save |
| 5 | Open a workspace | 📁 in the sidebar → Open, or Settings → Open |
| 6 | Start chatting | 🤖 in the sidebar |

---

## 3. Getting Your First API Key

### Groq (fast, free tier)

1. Go to [console.groq.com/keys](https://console.groq.com/keys).
2. Create an API key (starts with `gsk_`).
3. In VD Agent: Settings → Groq → paste the key → Save.

### Google Gemini (free tier, multimodal)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Create an API key (starts with `AIza`).
3. In VD Agent: Settings → Google Gemini → paste the key → Save.

### No key: local models

1. Install [Ollama](https://ollama.com/download) and pull a model, for example `ollama pull llama3.3`.
2. In VD Agent: Settings → Ollama (Local) → Save and make it active.
3. Prompts stay on your machine.

See [README.md](./README.md#ai-providers) for the provider categories.

---

## 4. Using the AI Agent

### Basic chat

1. Open 🤖 Agent.
2. Type a message and press **Enter** (**Shift+Enter** for a new line).
3. The response streams in. Click **⏹ Stop** to cancel the request.

### How the agent behaves

The agent is prompted to act like a senior engineer:

- It reads code and runs commands before explaining or changing things.
- It pushes back on vague or risky requests and proposes a safer approach.
- It verifies changes with your project's own commands (tests, typecheck, build) and reports what it ran.
- It asks before destructive actions like deleting files, discarding changes, or force-pushing.

You can add your own conventions in Settings → **Custom Rules**.

### Free keys and automatic model selection

For OpenAI-compatible providers, on each request VD does the following:

1. Lists the models your key can call (`/models`, cached for 10 minutes).
2. Drops non-chat models (embeddings, audio, speech, image, moderation, rerank).
3. Ranks the rest by coding quality, then efficiency. On OpenRouter, only `:free` models are considered when they are available.
4. Tries the best model first, then the next few, then the model set in Settings.
5. Moves to the next model on model-not-found, unsupported model, 404, 429, overload, capacity, or 503 errors.
6. Stops immediately on an invalid key or other auth error. It does not try other models or providers, so you can fix the key.
7. Saves the model that worked as the provider's model in Settings.

To pin a specific model, choose it in the **model picker** in the Agent header. The list shows models discovered for the active provider. A pinned model is never replaced automatically. Choose **Auto** to go back to automatic selection.

### Provider fallback

If the active provider fails for a non-auth reason, VD tries up to three other **official free** providers that have keys. The terminal panel logs each attempt. Local servers and community proxies are never used as fallbacks.

### What the agent can do

| Action | Example |
|--------|---------|
| Read files | "Read src/App.tsx and explain it" |
| Write files | "Create a Button component in src/components" |
| Edit files | "In main.ts, change the port to 3001" |
| Run commands | "Run npm test and fix any failures" |
| Git | "Show the diff and write a commit message" |
| Search code | "Find all uses of useState" |
| Web search | "Look up the React 19 release notes" |

### Multi-round tool execution

After each batch of tool calls, the results go back to the model and it continues. A request runs up to **10 tool rounds**. If the limit is reached, the chat says so and you can reply "continue".

### @ mentions

| Type | Meaning | Example |
|------|---------|---------|
| `@path` | A file or folder in the workspace | `@src/App.tsx explain this` |
| `@web` | Search the web | `@web latest Node.js LTS` |

---

## 5. Code Editor

- Open files from the File Browser, the command palette (`Ctrl+P`), or when the agent reads a file.
- Monaco editor with syntax highlighting, minimap, and find/replace (`Ctrl+F` / `Ctrl+H`).
- `Ctrl+S` saves and `Ctrl+W` closes the tab. A dot on the tab marks unsaved changes.

---

## 6. Terminal

- Toggle with ``Ctrl+` `` or open the Terminal panel from the sidebar.
- Use **+** to add tabs and **×** to close them.
- It's a real PTY shell: PowerShell on Windows, your login shell on macOS/Linux.

---

## 7. Git

Open with `Ctrl+G` or the branch icon in the sidebar.

- **Status**: current branch, and staged, modified, and untracked files.
- **Diff**: click a file for a unified or split diff.
- **Commit / Push / Pull / Refresh**: buttons in the Git panel.
- **Branches**: the Branch Manager creates, switches, and deletes branches and handles stash/pop.

Undoing the last commit, discarding changes, and generating commit messages are agent tools (`git_undo_last`, `git_discard_changes`, `git_generate_commit`). Ask the agent. It is instructed to confirm destructive actions first.

---

## 8. File Browser

- Click folders to expand them and files to open them.
- Right-click for file actions. Use the filter box to narrow by name.
- **Open Folder** changes the workspace.

---

## 9. Command Palette

| Shortcut | Opens |
|----------|-------|
| `Ctrl+P` | File search |
| `Ctrl+Shift+P` | Commands |

Commands include panel navigation, toggling the terminal, **New Chat**, and **Go to Chat History**. Use ↑/↓ to move, Enter to run, and Escape to close.

---

## 10. Chat History

- Chats are **saved automatically** shortly after each message to `<userData>/conversations/<session-id>.json`. Each chat keeps one file that is updated in place.
  - Windows: `%APPDATA%\VD Agent\conversations`
  - macOS: `~/Library/Application Support/VD Agent/conversations`
  - Linux: `~/.config/VD Agent/conversations`
- On startup the most recent chat is restored, and all saved chats appear in the **💾 Sessions** panel and the Agent **🕘 History** popover.
- Click a chat to open it. **＋ New chat** starts a fresh conversation, and the previous one stays in history.
- Deleting a chat asks for confirmation, then removes its file from disk.
- Configured API keys and common key formats are redacted before saving. Corrupt files are skipped, and files from older versions still load.
- Chats that contain only system notices (for example "No API key configured") are not saved.
- Use **📤 Export** in the Agent header to download the current chat as Markdown.

---

## 11. Plan Mode

Toggle **📋 Plan** in the Agent header (or in Settings). With Plan Mode on, the agent lists the files it will read or change, the intended change and its risks, and the order of steps, then waits for your approval without modifying anything.

Use it for multi-file refactors, architecture changes, or any time you want to review before files change.

---

## 12. Images and Files

- **Paste** a screenshot with `Ctrl+V`, **drag** image files onto the chat, or use **📎**.
- Thumbnails appear above the input. Click × to remove one.
- Dropping a non-image file adds its path to the message.

Image contents are not sent to the model yet. The message lists the attached file names. Use the `image_analysis` tool (Gemini key required) to analyze an image by path or URL.

---

## 13. Web3 Tools

- `web3_balance`: native balance on Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, or Sepolia.
- `web3_explorer`: block explorer links for a transaction, address, or block.
- `web3_ipfs`: fetch content by CID. Upload depends on an external service.
- `web3_contract`: verification steps and ABI lookup links.
- `web3_deploy`: Hardhat deployment steps. It does not deploy anything itself.

---

## 14. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | File search |
| `Ctrl+Shift+P` | Commands |
| `Ctrl+S` | Save file |
| `Ctrl+W` | Close tab |
| ``Ctrl+` `` | Toggle terminal |
| `Ctrl+G` | Git panel |
| `Ctrl+B` | File browser |
| `Ctrl+Shift+A` | Agent chat |
| `Ctrl+F` / `Ctrl+H` | Find / replace in editor |
| `Escape` | Close palette or menus |
| `Enter` / `Shift+Enter` | Send / new line |
| `Ctrl+V` | Paste image into chat |

---

## 15. Building the Desktop App

### Windows

```cmd
Win\build.bat
```

The script runs from the repository root. It cleans old output, installs dependencies, runs `npm test`, `npm run lint`, and `npm run build`, then packages with electron-builder. It **stops if any step fails**. Output in `release\`:

- `VD Agent Setup <version>.exe`: NSIS installer
- `VD Agent <version>.exe`: portable

### macOS

```bash
bash Mac/build.sh
```

Output in `release/`: `VD Agent-<version>.dmg` and `VD Agent-<version>-mac.zip`.

### Linux

```bash
npm install
npm run build
npx electron-builder --linux
```

Output: an AppImage and a `.deb` in `release/`.

Code signing is disabled by default. Set `CSC_LINK` and `CSC_KEY_PASSWORD` to sign.

### Tests and checks

```bash
npm test               # all unit tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
npm run lint           # TypeScript typecheck
npm run build          # production build
```

---

## 16. Troubleshooting

### App won't start

| Problem | Solution |
|---------|----------|
| `npm install` fails on `node-pty` | Install native build tools (see Prerequisites), then reinstall |
| Port 5173 in use | Stop the other dev server |
| Blank screen | Open DevTools (`Ctrl+Shift+I`) and check the console |

### Agent not responding

| Problem | Solution |
|---------|----------|
| "No API key configured" | Settings → add a key for the active provider |
| "rejected the API key" | The key is invalid or revoked. Re-copy it from the provider. VD does not fall back on auth errors on purpose. |
| Rate limited / all providers failed | Wait a minute, add a key for another free provider, or use a local model |
| Wrong or weak model chosen | Pick a model in the Agent header to pin it |
| Timeout | Check your connection or try a local provider |

### Git

| Problem | Solution |
|---------|----------|
| "Not a git repository" | Run `git init` in the workspace |
| Push rejected | Pull first: `git pull --rebase` |

### Build

| Problem | Solution |
|---------|----------|
| Type errors | `npm run lint` |
| Tests fail | `npm test`. The build scripts stop on failures. |
| Missing icons warning | Add `build/icon.ico`, `build/icon.icns`, `build/icon.png` |

---

## 17. FAQ

**Is it free?**
The app is free to download and use, including for commercial work, under the [VD Agent License](./LICENSE). It is proprietary, source-available software owned by Virender Dhiman: you may not resell, redistribute, or rebrand it, and you must keep the credit. Many providers have free tiers, and their limits are set by the provider and change over time. Local models cost nothing.

**How do I credit VD Agent?**
When you share, review, or demo it, use: `VD Agent by Virender Dhiman - https://virender.in` and link to https://github.com/virrdhiman/desktop-agent. A ⭐ on GitHub is appreciated.

**Can I use several providers?**
Yes. Add keys for several official free providers and VD falls back between them on rate limits or unavailable models. Invalid keys are reported instead of skipped.

**Where are my API keys stored?**
In `<userData>/settings.json`, encrypted with the OS keychain via Electron `safeStorage` when available. They are never written to chat history or settings exports.

**Where is my chat history?**
In `<userData>/conversations/`, one JSON file per chat. See [Chat History](#10-chat-history).

**Telemetry?**
None.

**Offline?**
Yes, with a local provider such as Ollama. Editing, terminal, and git work offline.

**How do I update?**
`git pull && npm install && npm run dev`.
