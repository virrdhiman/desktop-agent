<!--
  @author Virender Dhiman
  @year 2025
  @project Freebuff Agent
  @license MIT
-->

# 📘 Freebuff Agent — Complete Usage Guide

**Author:** Virender Dhiman

This guide walks you through everything you need to know to use Freebuff Agent effectively.

---

## Table of Contents

1. [Installation](#installation)
2. [First Launch & Setup](#first-launch--setup)
3. [Getting Your First API Key](#getting-your-first-api-key)
4. [Using the AI Agent](#using-the-ai-agent)
5. [Code Editor](#code-editor)
6. [Terminal](#terminal)
7. [Git Manager](#git-manager)
8. [File Browser](#file-browser)
9. [Command Palette](#command-palette)
10. [Session Management](#session-management)
11. [Plan Mode](#plan-mode)
12. [Image & File Support](#image--file-support)
13. [Web3 / Blockchain Tools](#web3--blockchain-tools)
14. [Keyboard Shortcuts](#keyboard-shortcuts)
15. [Building the Desktop App](#building-the-desktop-app)
16. [Troubleshooting](#troubleshooting)
17. [FAQ](#faq)

---

## 1. Installation

### Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm 9+** — Comes with Node.js
- **Git** — [Download](https://git-scm.com/)
- **Windows:** PowerShell or Git Bash
- **macOS:** Terminal (bash or zsh)

### Install Steps

```bash
# 1. Clone the repository
git clone https://github.com/virenderdhiman/freebuff-agent.git
cd freebuff-agent

# 2. Install dependencies
npm install

# 3. Start the app in development mode
npm run dev
```

The app window will open automatically after a few seconds.

---

## 2. First Launch & Setup

When you first open Freebuff Agent, you'll see:

1. **Sidebar (left)** — Navigation icons for each panel
2. **Main area (center)** — Shows the currently active panel
3. **Terminal (bottom)** — Collapsible integrated terminal

### Initial Setup Checklist

| Step | Action | Where |
|------|--------|-------|
| 1 | Open Settings | Click ⚙️ in sidebar, or press nothing yet |
| 2 | Pick a provider | Choose any FREE provider (Groq recommended) |
| 3 | Get API key | Click "Get Key" → sign up → copy key |
| 4 | Paste key | Paste in the API key field → click Save |
| 5 | Open workspace | Click 📁 in sidebar → Open → select a folder |
| 6 | Start chatting | Click 🤖 in sidebar → type your first message |

---

## 3. Getting Your First API Key

### Recommended: Groq (Fastest Free)

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up (free, no credit card)
3. Click **"Create API Key"**
4. Copy the key (starts with `gsk_...`)
5. In Freebuff Agent: ⚙️ Settings → Find "Groq" → Paste key → Save

### Alternative: Google Gemini (Best Multimodal)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with Google account
3. Click **"Create API Key"**
4. Copy the key (starts with `AIza...`)
5. In Freebuff Agent: ⚙️ Settings → Find "Google Gemini" → Paste key → Save

### Alternative: No Key Needed (Local AI)

1. Install Ollama: [ollama.com/download](https://ollama.com/download)
2. Pull a model: `ollama pull llama3.3`
3. In Freebuff Agent: ⚙️ Settings → Find "Ollama (Local)" → Save
4. Start chatting — everything runs on your machine, 100% private

### All Providers (See [README.md](./README.md#-ai-providers-37) for full list)

You can configure multiple providers and the app auto-falls back if one fails.

---

## 4. Using the AI Agent

### Basic Chat

1. Click 🤖 in the sidebar to open the Agent panel
2. Type your message in the input box at the bottom
3. Press **Enter** or click the Send button
4. Watch the response stream in real-time

### What the Agent Can Do

The agent can **autonomously**:

| Action | Example |
|--------|---------|
| **Read files** | "Read src/App.tsx and explain it" |
| **Write files** | "Create a new component called Button.tsx" |
| **Edit files** | "In main.ts, change the port to 3001" |
| **Run commands** | "Run npm test and fix any failures" |
| **Git operations** | "Commit these changes with a descriptive message" |
| **Search code** | "Find all uses of useState in the project" |
| **Web search** | "Search for the latest React 19 features" |
| **Web3/blockchain** | "Check the ETH balance of this address" |

### Multi-Round Execution

When the agent uses a tool, it goes through up to 5 rounds:

```
Your message → Agent decides to read a file → Reads it →
  → Agent sees the content → Decides to edit the file → Edits it →
  → Agent sees the edit worked → Reports back to you
```

### @Context Mentions

Type `@` in the chat input to reference things:

| Type | What It Does | Example |
|------|-------------|---------|
| `@filename` | Reference a specific file | `@src/App.tsx explain this` |
| `@folder` | Reference a directory | `@src/components/ list all files` |
| `@web` | Trigger a web search | `@web latest Node.js LTS version` |

### Streaming Responses

Responses stream token-by-token in real-time. You'll see text appearing character by character, just like ChatGPT.

### Stop Generation

While the agent is streaming a response, a red **"Stop"** button appears. Click it to cancel the response immediately.

### Plan Mode

Toggle Plan Mode in the chat header to have the agent:
1. Analyze your request
2. Create a detailed plan of changes
3. Show the plan for your review
4. Execute only after you approve

---

## 5. Code Editor

### Opening Files

- **File Browser:** Click 📁 in sidebar → click any file
- **Command Palette:** Press `Ctrl+P` → type filename → press Enter
- **From Chat:** When the agent mentions a file, click to open

### Editor Features

| Feature | How to Use |
|---------|-----------|
| **Syntax Highlighting** | Automatic for 50+ languages |
| **Minimap** | Toggle with the minimap button in top-right |
| **Find/Replace** | `Ctrl+F` to find, `Ctrl+H` to replace |
| **Multiple Tabs** | Click files to open in tabs |
| **Save** | `Ctrl+S` — saves to disk |
| **Close Tab** | `Ctrl+W` — close current tab |
| **Dirty Indicator** | Yellow dot on tab = unsaved changes |
| **Language Detection** | Automatic based on file extension |

---

## 6. Terminal

### Opening the Terminal

- Click **☰** in the sidebar
- Press `` Ctrl+` `` to toggle
- Drag the divider up from the bottom

### Multi-Tab Terminal

| Action | How |
|--------|-----|
| **New Tab** | Click the **+** button in the terminal header |
| **Close Tab** | Click the **×** on the tab |
| **Switch Tabs** | Click the tab name |
| **Shell** | PowerShell (Windows), bash/zsh (macOS/Linux) |

### What You Can Do

The terminal runs a real PTY (pseudo-terminal) — it's a fully functional shell:

```bash
# Run any command
npm install
git status
python3 script.py

# Navigate
cd src/
ls -la

# Build
cargo build --release
go run main.go
```

---

## 7. Git Manager

### Opening Git Panel

- Click the branch icon in the sidebar
- Press `Ctrl+G`

### Viewing Status

The Git panel shows:
- **Current branch** name
- **Staged files** (green)
- **Modified files** (yellow)
- **Untracked files** (gray)

### Diff Viewer

Click any file to see its diff:
- **Unified View** — Standard diff format
- **Split View** — Side-by-side comparison
- **Color-coded** — Green = added, Red = removed

### Committing Changes

1. Review your changes in the diff viewer
2. Optionally click **"AI Generate Message"** for a commit message
3. Type your commit message in the input box
4. Click **"Commit"**

### Branch Management

Click **"Branches"** to open the branch manager:
- **Create** a new branch
- **Switch** between branches
- **Delete** a branch
- **Stash** and **Pop** changes

### Other Git Operations

| Operation | Button |
|-----------|--------|
| Push to remote | **Push** button |
| Pull from remote | **Pull** button |
| Undo last commit | **Undo** button |
| Discard all changes | **Discard** button (⚠️ irreversible) |
| Refresh status | **Refresh** button |

---

## 8. File Browser

### Navigation

- Click the 📁 icon in the sidebar
- Click folders to expand/collapse
- Click files to open in the code editor

### Creating Files

1. Right-click a folder (or use the **+** button)
2. Enter the file name
3. The file opens in the editor

### Filtering

Use the search bar at the top of the file browser to filter files by name.

### Workspace

- Click **"Open Folder"** at the top of the file browser to change your workspace
- The workspace path is shown in the settings

---

## 9. Command Palette

### Opening

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Open with file search |
| `Ctrl+Shift+P` | Open with command search |

### Searching Files

Type a filename to search across your entire workspace:

```
App.tsx        → finds src/App.tsx
git panel      → finds GitPanel.tsx
store          → finds store/index.ts
```

### Running Commands

The command palette also lets you run actions:

```
commit         → Git commit
push           → Git push
new terminal   → Open terminal
settings       → Open settings
```

### Navigation

- **↑↓** arrows to navigate results
- **Enter** to select
- **Escape** to close

---

## 10. Session Management

### Saving Sessions

Sessions are saved automatically. You can also manually save:

1. Go to the 💾 Sessions panel (click 💾 in sidebar)
2. Click **"Save Session"**
3. Enter a name (optional)

### Loading Sessions

1. Open the Sessions panel
2. Click any saved session to load it
3. The conversation history appears in the Agent chat

### Session Persistence

Sessions persist across app restarts. When you close and reopen the app, your conversation history is restored.

---

## 11. Plan Mode

### What Is Plan Mode?

Plan Mode makes the agent think before acting. Instead of immediately executing changes, it:

1. Analyzes your request
2. Creates a step-by-step plan
3. Shows the plan for review
4. Executes only when you approve

### How to Use

1. Toggle **"Plan Mode"** in the Agent chat header
2. Send your request
3. Review the agent's plan
4. If satisfied, approve it
5. The agent executes the plan step by step

### When to Use

- Complex refactoring across multiple files
- Architecture changes
- When you want to review before any file changes happen
- Learning how to approach a problem

---

## 12. Image & File Support

### Pasting Images

1. Take a screenshot (`Print Screen`, `Cmd+Shift+4`, etc.)
2. Press `Ctrl+V` in the chat input
3. The image appears as a thumbnail preview
4. Send the message with the image attached

### Drag & Drop

1. Drag an image file from your desktop/file manager
2. Drop it onto the chat input area
3. The image appears as a thumbnail
4. Type a message and send

### Attaching Files

Click the 📎 button in the chat input to browse for images to attach.

### Removing Attachments

Click the **×** on any thumbnail to remove it before sending.

---

## 13. Web3 / Blockchain Tools

The agent has built-in Web3 tools:

### Check Wallet Balance

Ask the agent:
> "What's the ETH balance of 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38?"

The agent will check across 7 chains: Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Sepolia.

### Look Up Transactions

> "Look up this transaction: 0xabc123..."

### IPFS Operations

> "Fetch content from IPFS CID: QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o"

### Smart Contract Operations

> "Get the ABI of this contract: 0x... on Ethereum"

### Deployment Instructions

> "How do I deploy contracts/Token.sol to Sepolia testnet?"

---

## 14. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | File search / Command palette |
| `Ctrl+Shift+P` | Commands only |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+G` | Go to Git panel |
| `Ctrl+B` | Go to File browser |
| `Ctrl+Shift+A` | Go to Agent chat |
| `Ctrl+F` | Find in editor |
| `Ctrl+H` | Find & replace in editor |
| `Escape` | Close command palette / menus |
| `Enter` | Send chat message |
| `Shift+Enter` | New line in chat input |
| `Ctrl+V` | Paste image into chat |

---

## 15. Building the Desktop App

### Windows (.exe)

```cmd
# Option A: Use the build script
Win\build.bat

# Option B: Manual build
npm install
npm run build
npx electron-builder --win
```

**Output:**
- `release/Freebuff Agent Setup.exe` — NSIS installer
- `release/Freebuff Agent.exe` — Portable (no install needed)

### macOS (.dmg)

```bash
# Option A: Use the build script
Mac/build.sh

# Option B: Manual build
npm install
npm run build
npx electron-builder --mac
```

**Output:**
- `release/Freebuff Agent.dmg` — Disk image installer
- `release/Freebuff Agent-*.zip` — Archive

### Linux (AppImage / .deb)

```bash
npm install
npm run build
npx electron-builder --linux
```

**Output:**
- `release/Freebuff Agent-*.AppImage` — Portable
- `release/Freebuff Agent-*.deb` — Debian package

### Build Script Features

Both `Win/build.bat` and `Mac/build.sh` automatically:
1. Clean previous builds
2. Install dependencies
3. Run all 65 tests
4. Typecheck the project
5. Build with Vite
6. Package with electron-builder
7. Open the release folder

### Running Tests Only

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Lint / Typecheck

```bash
# Typecheck only (fast)
npx tsc --noEmit

# ESLint (if configured)
npx eslint src/ electron/
```

---

## 16. Troubleshooting

### App Won't Start

| Problem | Solution |
|---------|----------|
| `npm install` fails | Run `rm -rf node_modules && npm install` |
| `node-pty` fails | Make sure you have build tools: `npm install -g windows-build-tools` (Windows) or Xcode Command Line Tools (macOS) |
| Port already in use | Kill the existing process: `lsof -ti:5173 \| xargs kill` (Mac) or `netstat -ano \| findstr :5173` then kill (Windows) |
| Blank screen | Open DevTools (`Ctrl+Shift+I`) and check console errors |

### AI Agent Not Responding

| Problem | Solution |
|---------|----------|
| "No API key configured" | Go to ⚙️ Settings → add at least one API key |
| "Rate limited" | Wait a minute or switch to a different provider |
| "Invalid API key" | Re-copy the key from the provider's website |
| Timeout | Check internet connection, or try a local provider (Ollama) |

### Git Operations Fail

| Problem | Solution |
|---------|----------|
| "Not a git repository" | Initialize: `git init` in your workspace |
| "Permission denied" | Check file permissions |
| Push rejected | Pull first: `git pull --rebase` |

### Terminal Won't Open

| Problem | Solution |
|---------|----------|
| node-pty error | Rebuild: `cd node_modules/node-pty && npm run install` |
| Wrong shell | The app detects your OS default shell automatically |

### Build Fails

| Problem | Solution |
|---------|----------|
| Type errors | Run `npx tsc --noEmit` to find and fix them |
| electron-builder fails | Make sure `build/` folder has icons (see below) |
| Missing icons | Create `build/` folder with `icon.ico`, `icon.icns`, `icon.png` |

---

## 17. FAQ

### Q: Is this really free?
**A:** Yes! The app itself is 100% free and open source. Many AI providers offer free tiers. You only need 1 API key to start.

### Q: What's the best free provider?
**A:** **Groq** is the fastest (ultra-low latency). **Google Gemini** is best for multimodal (images + text). **Ollama** is best for privacy (runs locally, no data sent anywhere).

### Q: Can I use multiple providers?
**A:** Yes! Configure as many as you want. The app auto-falls back to the next configured provider if one fails.

### Q: Where are my API keys stored?
**A:** Encrypted on disk using your OS keychain (Windows Credential Manager, macOS Keychain, or Linux libsecret). They're never sent to anyone except the configured AI provider.

### Q: Does the app collect telemetry?
**A:** No. Zero telemetry, zero tracking, zero data collection. Everything stays on your machine.

### Q: Can I use this offline?
**A:** Yes, if you use a local provider like **Ollama**. All file editing, terminal, and git features work offline too.

### Q: How do I update?
**A:** Pull the latest changes:
```bash
git pull
npm install
npm run dev
```

### Q: How do I contribute?
**A:** See [CONTRIBUTING](#-contributing) section in README.md.

### Q: How many tools does the agent have?
**A:** 33 autonomous tools covering file ops, git, web search, Web3, image generation, video, speech-to-text, and more.

### Q: Can I run this on a server / in the cloud?
**A:** The desktop app requires a display. For headless use, you can use the Electron builder to create a virtual display (Xvfb on Linux).

---

## Quick Reference Card

```
┌──────────────────────────────────────────────────────┐
│                 FREEBUFF AGENT                        │
│                                                       │
│  SHORTCUTS:                                           │
│    Ctrl+P          Command palette                    │
│    Ctrl+Shift+P    Commands only                      │
│    Ctrl+S          Save file                          │
│    Ctrl+W          Close tab                          │
│    Ctrl+`          Toggle terminal                    │
│    Ctrl+G          Git panel                          │
│    Ctrl+B          File browser                       │
│    Ctrl+Shift+A    Agent chat                         │
│    Ctrl+V          Paste image                        │
│    Enter           Send message                       │
│    Shift+Enter     New line in input                  │
│                                                       │
│  PROVIDERS: 44 (38 free + 3 local + 4 paid)          │
│  TOOLS:      33 autonomous tools                      │
│  TESTS:      65 passing                               │
│  BUILD:      Win\build.bat / Mac/build.sh             │
│                                                       │
│  Author: Virender Dhiman                              │
│  License: MIT                                         │
└──────────────────────────────────────────────────────┘
```

---

**Built with ❤️ by Virender Dhiman**
