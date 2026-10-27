# PIT Agent Bridge

Local VS Code companion extension for PIT Agent. It exports the active editor,
selection, visible files, and open files into `.vd-agent/vscode-bridge.json`,
and processes local PIT Agent commands for open-file, diff-preview, and exact
edit actions.

It also maintains a local workspace index, offers lightweight VS Code
language-server/symbol/word inline completions, exposes definition, reference,
and rename commands, and provides commands to accept or reject the last PIT Agent
diff preview directly inside VS Code.

Use `PIT Agent: Run Inline Autocomplete Smoke Test` with the cursor after a
prefix in a code file to verify that the local fallback can produce a candidate.

When configured, it can call a local Ollama or OpenAI-compatible endpoint for
AI inline autocomplete and native editor actions. Local symbol completions remain
available as the no-cost fallback.

## Install From VSIX

In PIT Agent, open the `VS Code Bridge` panel and click `Install Bridge`. The app
uses this local `.vsix`; no marketplace account or paid service is needed.

Build the extension package from the PIT Agent repo:

```powershell
npm run vscode:package
```

Install it in VS Code:

```powershell
code --install-extension "release/vd-agent-vscode-bridge-0.4.7.vsix"
```

If VS Code opens the repository in Restricted Mode, the bridge runs in limited
mode. Active-editor export, status, and local inline autocomplete are available.
Trust the workspace to enable full indexing, terminals, command execution, and
edit/apply workflows.

Or use VS Code: Extensions panel -> `...` -> Install from VSIX -> choose the
file in `release/`.

## Use

1. Open the same repository folder in VS Code and PIT Agent.
2. In VS Code, run `PIT Agent: Export Workspace Context`.
3. In PIT Agent, open the VS Code panel and confirm it says `Connected`.

The bridge is local-only. It writes workspace files under `.vd-agent/`.
