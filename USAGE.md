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

Most people should download the installer from [GitHub Releases](https://github.com/virrdhiman/desktop-agent/releases). See [docs/INSTALL.md](./docs/INSTALL.md) for checksums, first-launch warnings, and uninstalling.

### Run from source

Prerequisites:

- **Node.js 20.19+** and npm
- **Git**
- Build tools for `node-pty`: Visual Studio Build Tools (Windows), Xcode Command Line Tools (macOS), or `build-essential` and `python3` (Linux)

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

See [docs/PROVIDERS.md](./docs/PROVIDERS.md) for the provider categories and more free options.

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

### Agent environments

Use the **Env** selector in the Agent header or Settings:

- **Normal** sends the request through the standard executor.
- **Smart** uses the team for substantial coding, documentation, and analysis work while keeping short chat on one model call. This is the recommended mode for free API keys.
- **Agentic** uses the team for every message.

The team runs sequentially: a Prompt Analyst clarifies intent and writes an optimized worker prompt, optional read-only specialists add task-specific guidance, the Worker/Executor uses tools and performs the work, a Reviewer checks the original request plus the optimized prompt against tool evidence, the Worker gets one focused repair pass when needed, and a Verifier writes the final response. Only the Worker can call tools or edit files. Drafts and internal review output stay out of chat; role progress appears in the task timeline.

Settings includes saved team presets: **Default Team**, **Coding Team**, **Research Team**, **CSV/Data Team**, and **Security Review Team**. Custom instructions can override the Prompt Analyst, Worker, Reviewer, and Final Verifier for your own workflow. Presets and custom roles guide the team, but the built-in tool restrictions, review cap, evidence checks, and token caps still apply.

The token budget controls specialist cost:

- **Cheap** keeps small chat single-agent for longer, skips dynamic specialists, and uses the tightest context/evidence caps.
- **Balanced** is the default and allows one dynamic specialist when useful.
- **Strong** allows more context and up to two dynamic specialists for harder work.

Agentic mode works with one provider, but separate configured official free providers allow more independent review and better rate-limit fallback. It makes more API calls than standard chat, so provider free-tier limits can be reached sooner. Smart mode is designed to avoid using the full team for small chat. Open **Tasks** after a run to inspect the visual agent trace with role input, output, provider, and evidence. See [docs/MULTI_AGENT.md](./docs/MULTI_AGENT.md) for the full workflow and limits.

### Free keys and automatic model selection

For OpenAI-compatible providers, on each request VD does the following:

1. Lists the models your key can call (`/models`, cached for 10 minutes).
2. Drops non-chat models (embeddings, audio, speech, image, moderation, rerank).
3. Ranks the rest by coding quality and efficiency, then uses local success, latency, and task-type outcomes to break close choices. On OpenRouter, only `:free` models are considered when they are available.
4. Tries the best model first, then the next few, then the model set in Settings.
5. Moves to the next model on model-not-found, unsupported model, 404, 429, overload, capacity, or 503 errors.
6. Stops immediately on an invalid key or other auth error. It does not try other models or providers, so you can fix the key.
7. Saves the model that worked as the provider's model in Settings.

To pin a specific model, choose it in the **model picker** in the Agent header. The list shows models discovered for the active provider. A pinned model is never replaced automatically. Choose **Auto** to go back to automatic selection.

### Provider fallback

If the active provider fails for a non-auth reason, VD tries up to three other **official free** providers that have keys. The selected provider is always first; fallbacks are ordered by local reliability and latency, and repeatedly failing providers receive a short cooldown. When another provider answers, the chat says which one. The rest of that request stays on the provider that answered, so a rate-limited provider isn't retried on every tool round. If every provider fails, the chat lists each provider's error and suggests next steps. Local servers and community proxies are never used as fallbacks.

### Answer quality

The agent is instructed to lead with the answer, skip filler, ask questions only when the answer changes what it would do, explain failed tool calls, and end with concrete next steps when work remains. VD Agent also enforces a few of these itself:

- Stock openers and closers ("Certainly!", "I hope this helps!") are removed from replies. Code blocks are never changed.
- Obvious action narration such as "I'll start by inspecting the repo" is removed; the tool runs directly. Brief handoff/status messages do not trigger a generic "what next?" question.
- If a model returns an empty reply, the next model is tried. If a reply is still empty, only pleasantries, stuck repeating itself, generically asks for a task already supplied, or denies restored chat context, the agent is asked once to answer again. If that also fails, the chat says so and suggests what to try.
- If a reply says files were changed, commands were run, or tests passed, but no tool call in that request did so, the agent is asked once to do the work or say what was not done. If the claim remains, the chat adds a "Check this reply" notice.
- Failed tools, failed commands (with exit code and output), and malformed tool calls are reported to the model so it can adapt instead of guessing. VD accepts its fenced format plus common Qwen/native and known bare-JSON tool-call variants from free models.

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

- The editor opens to the right of the 🤖 **Agent** panel, so you can chat and edit side by side.
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

- Chats are **saved automatically** shortly after changes and flushed periodically to `<userData>/conversations/<session-id>.json`. Each chat keeps one file and a last-known-good backup.
  - Windows: `%APPDATA%\VD Agent\conversations`
  - macOS: `~/Library/Application Support/VD Agent/conversations`
  - Linux: `~/.config/VD Agent/conversations`
- On startup the most recent chat is restored, including its workspace, open files, tasks, recent tool outcomes, provider/model, terminal summary, verification result, and recovery checkpoint.
- The **Sessions** panel can search, rename, pin, import, export, open, and delete chats. **＋ New chat** starts a fresh conversation, and the previous one stays in history.
- Before agent file edits or deletes, VD stores a bounded pre-change checkpoint. Use **Restore** on the session to return the recorded files to that state. Command and Git side effects are not included.
- Deleting a chat asks for confirmation, then removes its file from disk.
- Configured API keys and common key formats are redacted before saving. If the current file is corrupt, VD attempts its `.bak` copy. Files from older versions still load.
- Chats that contain only system notices (for example "No API key is configured") are not saved.
- Use **📤 Export** in the Agent header to download the current chat as Markdown.

---

## 11. Plan Mode

Toggle **📋 Plan** in the Agent header (or in Settings). With Plan Mode on, the agent lists the files it will read or change, the intended change and its risks, and the order of steps, then waits for your approval without modifying anything. Plan Mode itself is an instruction to the model. Tool permissions are a separate technical control enforced by the Electron main process.

Use it for multi-file refactors, architecture changes, or any time you want to review before files change.

Choose the permission mode in Settings:

| Mode | Behavior |
|------|----------|
| Ask for risky actions | Confirms shell commands, deletes, and Git mutations. Normal file edits are checkpointed. |
| Ask for all writes | Also confirms ordinary file writes and edits. |
| Trusted workspace | Reduces prompts. Workspace path restrictions and checkpoints still apply. |

An approved shell command has your user permissions and can change files outside the workspace or call network services. Read the command in the native dialog before approving it.

---

## 12. Images and Files

- **Paste** a screenshot with `Ctrl+V`, **drag** image files onto the chat, or use **📎**.
- Thumbnails appear above the input. Click × to remove one.
- Dropping a non-image file adds its path to the message.

Image contents are not sent to the model yet. The message lists the attached file names. Use the `image_analysis` tool (Gemini key required) to analyze an image by path or URL.

### ZIP and CSV workflows

For a request such as "check every file in this ZIP and provide the relevant common data as CSV," add the ZIP path to the message and open the folder containing it as the workspace. VD Agent can:

1. Inventory the archive before extraction and reject unsafe paths, links, or excessive expansion.
2. Extract it into a new workspace folder without replacing existing files by default.
3. Inspect every supported source file and report anything it cannot parse.
4. Separate common fields from entity-specific fields, keep a `source_file` column for traceability, and avoid forcing incompatible records into one table.
5. Write UTF-8 CSV with stable headers and then parse it again to check row widths, required fields, malformed rows, and duplicates.

Review the generated CSV before using it for production imports. Ambiguous field meanings still require domain knowledge.

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

Run the build script for your OS from the repository root. Each platform must be built on that OS.

| Platform | Command | Output in `release/` |
|----------|---------|----------------------|
| Windows | `Win\build.bat` | NSIS installer and portable `.exe` |
| macOS | `bash Mac/build.sh` | `.dmg` and `.zip` |
| Linux | `bash Linux/build.sh` | `.AppImage` and `.deb` |

Each script cleans old output, installs dependencies, runs `npm test`, `npm run lint`, and `npm run build`, then packages with electron-builder and writes `SHA256SUMS.txt`. It **stops if any step fails**. Builds are unsigned unless signing certificates are configured.

Signing, packaged-app smoke tests, and publishing are covered in [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).

### Tests and checks

```bash
npm test               # all unit tests
npm run test:reliability # persistence, archive, and private-diagnostics stress checks
npm run test:watch     # watch mode
npm run lint           # TypeScript typecheck
npm run build          # production build
npm run smoke          # build, then launch the app and check it end to end
```

---

## 16. Troubleshooting

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for install, agent, editor, git, and build problems.

The most common fixes:

| Problem | Solution |
|---------|----------|
| "No API key is configured" | Settings → add a key for the active provider |
| "rejected the API key" | The key is invalid or revoked. Re-copy it from the provider. VD does not fall back on auth errors on purpose. |
| Can't see the file you opened | The editor appears beside the 🤖 Agent panel |
| Blank screen | Open DevTools (`Ctrl+Shift+I`) and check the console |

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
Download the latest installer from [Releases](https://github.com/virrdhiman/desktop-agent/releases) and install it over the old version. Your settings, keys, and chats are kept. From source: `git pull && npm install && npm run dev`.

**Is my data private?**
Chats, settings, and keys stay on your machine. Prompts and the code the agent reads go to the AI provider you choose. See [docs/PRIVACY.md](./docs/PRIVACY.md).
