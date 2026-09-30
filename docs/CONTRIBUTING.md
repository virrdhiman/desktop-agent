<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# Contributing

Bug reports, fixes, and improvements are welcome.

## Before you start

- VD Agent is proprietary, source-available software under the [VD Agent License](../LICENSE). Its dependencies keep their own open-source licenses; don't remove their license files or notices. You may fork it on GitHub **only to send contributions back**. By opening a pull request, you agree to section 3 of the license, which grants the author rights to use your contribution.
- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Report security problems privately. See [SECURITY.md](./SECURITY.md).

## Setup

Requirements: Node.js 20 or newer, git, and native build tools for `node-pty` (see [INSTALL.md](./INSTALL.md#run-from-source)).

```bash
git clone https://github.com/<you>/desktop-agent.git
cd desktop-agent
npm install
npm run dev
```

## Checks

| Command | What it does |
|---------|--------------|
| `npm test` | Vitest unit tests for the renderer, `src/lib`, and the Electron main-process logic |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |
| `npm run build` | Production build of the renderer and the Electron main process and preload |
| `npm run smoke` | Builds, then launches the real app twice with a throwaway profile and checks it end to end. Needs a desktop session. |

Run `npm test`, `npm run lint`, and `npm run build` before every pull request. Also run `npm run smoke` if you changed anything in `electron/`, the build config, or app startup.

## Guidelines

- Keep changes focused. One topic per pull request.
- Match the surrounding code: TypeScript strict mode, existing naming, and the same comment style. New source files start with the standard header block.
- Put pure logic in testable modules, such as `src/lib/*` or `electron/conversationStore.ts`, and add tests for it.
- Never log, store, or commit API keys. Keep the renderer sandboxed. New system access goes through an IPC handler and `window.api`.
- Update the docs when behavior changes: README, USAGE, `docs/`, TOOLS, and CHANGELOG.
- See [ARCHITECTURE.md](../ARCHITECTURE.md) for how to add a tool, provider, or panel.

## Pull requests

1. Create a branch from `main`.
2. Make your change and run the checks above.
3. Open a pull request that explains what changed, why, and how you tested it. Include screenshots for UI changes.
