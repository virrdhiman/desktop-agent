<!--
  @author Virender Dhiman
  @year 2025
  @project Freebuff Agent
  @license MIT
-->

# Changelog

All notable changes to Freebuff Agent are documented here.

## [1.0.0] - 2025-08-28

### Initial Release

#### AI Agent
- Autonomous AI coding agent with streaming responses
- 33 agent tools: file ops, git, code search, web search, Web3, image/video, speech
- Multi-provider fallback chain (auto-retry on failure)
- Plan Mode (plan before executing)
- Multi-round tool execution (up to 10 follow-ups)
- @context mentions (@file, @folder, @web)
- Image paste (Ctrl+V) and drag-and-drop support
- Token/cost tracking with per-provider pricing estimates
- Diff viewer for agent file edits (inline before/after)
- Model quick-switch dropdown in chat header
- Stop generation button
- Session save/load/export

#### AI Providers
- 44 providers: 16 free official, 3 local, 14 community, 6 image/video, 4 paid, 1 other
- Provider categories: Free, Local, Community, Image/Video, Paid
- API key encryption via OS keychain (safeStorage)
- Provider search and filter in Settings
- Import/export settings

#### Code Editor
- Monaco editor with syntax highlighting
- Multi-tab file editing
- Save/close files
- Lazy-loaded for performance

#### Git Integration
- Git status, diff (unified + split view)
- Commit with AI-generated messages
- Branch manager (create, switch, delete)
- Stash operations
- Push/pull instructions

#### Terminal
- Multi-tab terminal with PTY support
- Integrated bottom panel
- Keyboard shortcut (Ctrl+`)

#### File System
- File browser with directory tree
- Create/delete files
- File search (by name and content)
- Code search (grep-like)

#### UI/UX
- Dark theme with CSS custom properties
- Command palette (Ctrl+P)
- Keyboard shortcuts for all panels
- Responsive layout
- ARIA labels and keyboard navigation

#### Security
- Content Security Policy headers
- API key encryption at rest
- Context isolation enabled
- Sandbox mode

#### Developer Experience
- TypeScript strict mode (0 errors)
- 65 unit + integration tests (Vitest)
- ESLint configured
- electron-builder packaging (NSIS, DMG, AppImage)
- Build scripts for Windows (.bat) and macOS (.sh)

#### Web3 Tools
- Wallet balance check (7 EVM chains)
- Block explorer links
- IPFS upload/fetch
- Smart contract operations (verify, ABI, deploy)

#### Image/Video/Speech
- Image generation via Pollinations (free, no API key)
- Image analysis via Gemini
- Video generation instructions (Pollinations, Runway, Kling)
- Speech-to-text via Groq Whisper / HuggingFace
- Text-to-speech via Pollinations
- Code review with static analysis

### Built With
- Electron 31
- React 18
- TypeScript 5.5
- Vite 5.4
- Zustand 4.5
- Monaco Editor 0.50
- xterm.js 5.3
- simple-git 3.25
