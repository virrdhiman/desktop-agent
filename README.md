<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# VD Agent

> A desktop AI coding agent for your local repositories. It reads and edits files, runs commands, and manages git through tool calls, and it works with free API keys by picking the strongest chat model each key can call.
>
> **Author:** [Virender Dhiman](https://virender.in)
> **License:** [VD Agent License](./LICENSE). Free to download and use, credit required. VD Agent is the exclusive property of Virender Dhiman.

[![GitHub stars](https://img.shields.io/github/stars/virrdhiman/desktop-agent?style=social)](https://github.com/virrdhiman/desktop-agent/stargazers)
![License](https://img.shields.io/badge/license-VD%20Agent%20License-blueviolet)
![Electron](https://img.shields.io/badge/Electron-31-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

**If VD Agent is useful to you, please [star the repository](https://github.com/virrdhiman/desktop-agent) and credit [virender.in](https://virender.in) when you share it.**

---

## Features

### Agent
- Reads, writes, and edits files, searches code, runs shell commands, and runs git operations through tool calls. The tool list lives in `src/types/index.ts` (`AGENT_TOOLS`) and is sent to the model in the system prompt.
- Multi-round tool execution: up to 10 rounds of tool call, result, and follow-up per request. If the limit is reached, the chat says so and you can reply "continue".
- Streaming responses, and a **Stop** button that cancels the in-flight request.
- Senior-engineer system prompt: inspect before claiming, challenge risky requests, verify with commands before reporting success, and state risks plainly.
- **Plan Mode**: the agent proposes a plan and waits for approval before changing anything.
- **Custom Rules**: your own instructions appended to every system prompt.

### Free API keys and model selection
- For OpenAI-compatible providers, VD calls `/models` on your key, filters out non-chat models (embeddings, audio, speech, image, moderation, rerank), and ranks the rest by coding quality and then efficiency.
- The best discovered model is tried first, then the next ones, then the model configured in Settings.
- It moves to the next model on model-not-found, unsupported model, 404, 429 (rate limit), overload, capacity, and 503 errors.
- An invalid key or other auth failure stops immediately. VD does not retry other models or providers, so the problem isn't hidden.
- The model that worked is saved as that provider's model, unless you pinned a model in the Agent header.
- If the active provider fails for a non-auth reason, VD tries up to three other **official free** providers that have keys. Local servers and community proxies are never used as automatic fallbacks.

### Chat history
- Every conversation is auto-saved shortly after each message to `<userData>/conversations/<session-id>.json` on your machine. Repeated saves update the same file.
- The most recent chat is restored on startup. All saved chats are listed in the **Sessions** panel and the Agent **History** popover, where you can open or delete them. Deleting removes the file from disk.
- API keys configured in Settings, and common key formats (`sk-…`, `gsk_…`, `AIza…`, `hf_…`, and others), are redacted before anything is written. Corrupt or legacy files are skipped or upgraded without crashing.

### Editor, terminal, git
- Monaco editor with tabs, `Ctrl+S` to save, and a dirty indicator.
- Multi-tab PTY terminal (PowerShell on Windows, your login shell on macOS/Linux).
- Git status, diff (unified and split), commit, push, pull, branches, and stash.
- Command palette (`Ctrl+P` for files, `Ctrl+Shift+P` for commands).
- `@` mentions for files, folders, and web search. Paste or drag images into the chat.

### Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | File search / command palette |
| `Ctrl+Shift+P` | Commands only |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close current tab |
| ``Ctrl+` `` | Toggle terminal |
| `Ctrl+G` | Go to Git |
| `Ctrl+B` | Go to Files |
| `Ctrl+Shift+A` | Go to Agent |

---

## Agent tools

| Category | Tools |
|----------|-------|
| **File system** | `read_file`, `write_file`, `edit_file`, `create_file`, `delete_file`, `list_files`, `search_files`, `search_code` |
| **Commands** | `run_command` (30 s timeout) |
| **Project** | `read_directory_tree`, `multi_file_edit`, `code_review` |
| **Git** | `git_status`, `git_diff`, `git_commit`, `git_log`, `git_branch`, `git_stash`, `git_generate_commit`, `git_undo_last`, `git_discard_changes` |
| **Web** | `web_search` |
| **Media** | `generate_image`, `image_analysis`, `generate_video`, `comfyui_workflow`, `speech_to_text`, `text_to_speech` |
| **Web3** | `web3_balance`, `web3_explorer`, `web3_ipfs`, `web3_contract`, `web3_deploy` |

Some media and Web3 tools return links or setup instructions rather than doing the work locally. See [TOOLS.md](./TOOLS.md) for what each tool does.

---

## AI providers

The provider catalog is defined in `electron/handlers/settings.ts`, and Settings shows the current count per category. New catalog entries are added to existing settings files on load.

| Category | Examples | Notes |
|----------|----------|-------|
| **Free official** | Groq, Cerebras, SambaNova, Hugging Face, Gemini, GitHub Models, OpenRouter, Mistral, and others | Eligible for automatic fallback. Free-tier limits are set by each provider and change often. |
| **Local** | Ollama, LM Studio, llama.cpp | Runs on your machine. Prompts stay local. |
| **Community** | gpt4free, Pollinations, and several Discord-run proxies | Unofficial third-party proxies. They receive your prompts and code. Never used automatically. |
| **Image/Video** | FLUX, Runway, Kling, Replicate, Stability | Not chat providers. |
| **Paid** | OpenAI, Anthropic, Cohere, Perplexity | Billed by the provider. Anthropic uses the Messages API and has no model discovery. |

---

## Download and run

VD Agent is free to download and use. Get it from the official repository, either with `git clone` or **Code → Download ZIP** on GitHub, then run it:

```bash
git clone https://github.com/virrdhiman/desktop-agent.git
cd desktop-agent
npm install
npm run dev
```

To build an installer for your own machine, see [Building the desktop app](./USAGE.md#15-building-the-desktop-app). Official installers, when published, are on the [Releases](https://github.com/virrdhiman/desktop-agent/releases) page.

1. Open **Settings** and pick a free provider (Groq or Gemini are good starting points).
2. Click **Get API Key**, create a key, paste it, and click **Save**.
3. Open a workspace folder (Files → Open, or Settings → Open).
4. Go to **Agent** and send a message.

---

## Architecture

```
electron/
  main.ts                  Window, CSP, link handling, handler registration
  preload.ts               contextBridge API (window.api) and its types
  conversationStore.ts     Chat history on disk (pure Node, unit tested)
  navigation.ts            External links open in the browser; the window stays on the app
  handlers/
    ai.ts                  Streaming chat, /models discovery, per-model retry, cancel
    conversations.ts       conversations:save / list / delete IPC
    settings.ts            Provider catalog, encrypted API keys
    tools.ts               Agent tool implementations
    fs.ts, git.ts, terminal.ts, shell.ts
src/
  components/              AgentChat, SettingsPanel, SessionsPanel, editor, git, terminal, ...
  lib/modelSelect.ts       Model filtering, ranking, error classification
  lib/providers.ts         Provider categories, fallback chain, model persistence
  lib/brand.ts             App name, version, author credit, and links
  store/index.ts           Zustand store, including session auto-save
  types/index.ts           Shared types and AGENT_TOOLS
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

### Security and privacy
- Context isolation and sandboxing are on, and `nodeIntegration` is off. The renderer can only use the APIs exposed by the preload script.
- API keys are stored in `<userData>/settings.json` and encrypted with Electron `safeStorage` (the OS keychain) when it is available. If it isn't, for example on Linux without a keyring, keys are stored in plain text.
- Keys are only sent to the provider's configured base URL. They are never written to chat history, logs, or settings exports.
- No telemetry.
- The agent can run shell commands and edit files with your user permissions. Review what it does, especially in Plan Mode off.

---

## Development

```bash
npm test          # Vitest (renderer, lib, and electron unit tests)
npm run lint      # TypeScript typecheck (tsc --noEmit)
npm run build     # tsc + vite build (renderer and Electron main/preload)
```

Packaging: `Win\build.bat` or `Mac/build.sh` (see [USAGE.md](./USAGE.md#15-building-the-desktop-app)).

## Documentation

- [USAGE.md](./USAGE.md): how-to guide
- [TOOLS.md](./TOOLS.md): agent tools reference
- [ARCHITECTURE.md](./ARCHITECTURE.md): technical overview
- [CHANGELOG.md](./CHANGELOG.md)

## Contributing

Bug reports and pull requests are welcome.

1. Fork the repository on GitHub and create a feature branch. Forks may only be used to send contributions back.
2. Run `npm test`, `npm run lint`, and `npm run build`.
3. Open a pull request. By contributing you agree to section 3 of the [license](./LICENSE).

## Credit

If you share, review, demo, or write about VD Agent, please credit it like this:

```
VD Agent by Virender Dhiman - https://virender.in
https://github.com/virrdhiman/desktop-agent
```

And if it saves you time, a ⭐ on [GitHub](https://github.com/virrdhiman/desktop-agent) helps other people find it.

## License

Copyright (c) 2025-2026 [Virender Dhiman](https://virender.in). All rights reserved.

VD Agent is proprietary, source-available software and the exclusive property of Virender Dhiman. It is licensed under the [VD Agent License](./LICENSE). In short:

| You may | You may not |
|---------|-------------|
| Download it from the official repository and build it | Sell, redistribute, or republish it, modified or not |
| Use it free of charge for personal and commercial work | Remove or change the name, logo, or author credits |
| Modify your own copy for your own use | Offer it, or a service based on it, as a hosted service |

Keep the copyright notices and credit intact. The [LICENSE](./LICENSE) file is the binding text. For other permissions, contact the author through [virender.in](https://virender.in).
