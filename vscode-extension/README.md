# VD Agent Bridge

Local VS Code companion extension for VD Agent. It exports the active editor,
selection, visible files, and open files into `.vd-agent/vscode-bridge.json`,
and processes local VD Agent commands for open-file, diff-preview, and exact
edit actions.

It also maintains a local workspace index, offers lightweight symbol/word inline
completions, and provides commands to accept or reject the last VD Agent diff
preview directly inside VS Code.

When configured, it can call a local Ollama or OpenAI-compatible endpoint for
AI inline autocomplete and native editor actions. Local symbol completions remain
available as the no-cost fallback.

## Install From VSIX

In VD Agent, open the `VS Code Bridge` panel and click `Install Bridge`. The app
uses this local `.vsix`; no marketplace account or paid service is needed.

Build the extension package from the VD Agent repo:

```powershell
npm run vscode:package
```

Install it in VS Code:

```powershell
code --install-extension "release/vd-agent-vscode-bridge-0.4.1.vsix"
```

Or use VS Code: Extensions panel -> `...` -> Install from VSIX -> choose the
file in `release/`.

## Use

1. Open the same repository folder in VS Code and VD Agent.
2. In VS Code, run `VD Agent: Export Workspace Context`.
3. In VD Agent, open the VS Code panel and confirm it says `Connected`.

The bridge is local-only. It writes workspace files under `.vd-agent/`.
