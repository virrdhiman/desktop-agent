<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# VS Code Bridge

VD Agent can read VS Code's current workspace/editor context and send local
editor commands through the VD Agent Bridge extension in `vscode-extension/`.

The bridge writes a local file at:

```text
.vd-agent/vscode-bridge.json
.vd-agent/commands/*.json
.vd-agent/command-results/*.json
.vd-agent/vscode-last-command.json
.vd-agent/vscode-index.json
.vd-agent/vscode-last-preview.json
```

The context file includes the active file, active language, selected text,
visible editors, open text documents, and a summary of the VS Code-side local
index. Command files let VD Agent ask VS Code to open files, apply exact edits,
reveal diff previews, or run a specific VS Code command. Source code,
selections, commands, previews, index data, and results stay local.

## Install From Source

1. Open `vscode-extension/` in VS Code.
2. Press `F5` to start an Extension Development Host.
3. Open your project folder in that host window.
4. Run `VD Agent: Export Workspace Context` from the Command Palette.

## Install From VSIX

VD Agent can install the bridge from its `VS Code Bridge` panel when VS Code is
installed and the `code` command is available. This path is free and does not
require marketplace publishing, certificates, or hosted accounts.

For development builds, create the local one-click package:

```powershell
npm run vscode:package
```

This writes:

```text
release/vd-agent-vscode-bridge-0.2.0.vsix
vscode-extension/vd-agent-vscode-bridge-0.2.0.vsix
```

Install from VD Agent: open the `VS Code Bridge` panel, click `Install Bridge`,
then click `Open Workspace`. If VS Code is missing, click `Install VS Code` and
install the free VS Code app first.

Or install from the command line:

```powershell
code --install-extension "release/vd-agent-vscode-bridge-0.2.0.vsix"
```

Or install from VS Code: Extensions panel -> `...` -> Install from VSIX -> pick
the generated file under `release/`.

After install, open the same repository in VS Code and VD Agent, then run
`VD Agent: Export Workspace Context`. The VD Agent `VS Code` panel shows
connected/not connected, active file, pending commands, and the last command
result.

## VS Code-Native Features

The extension also adds no-cost VS Code-side polish:

- `VD Agent: Rebuild Local Workspace Index` writes a local symbol/token index
  for faster context and status reporting.
- Lightweight inline completions suggest workspace words and symbols without a
  paid AI autocomplete service.
- `VD Agent: Accept Last Previewed Edit` and `VD Agent: Reject Last Previewed
  Edit` let users review a bridge diff in VS Code before applying it.
- The VS Code status bar item opens a bridge status dialog with pending command,
  index, and preview state.

## Use From VD Agent

Open the same repository in VD Agent. In a chat, ask for VS Code context or let
the agent call:

```json
{"name":"vscode_context","args":{}}
```

The bridge is optional. If it is not installed or has not exported context yet,
VD Agent falls back to its own workspace files, repo map, search, git diff, and
editor state.

Two-way tools:

```json
{"name":"vscode_open","args":{"path":"src/App.tsx","line":10}}
{"name":"vscode_show_diff","args":{"path":"src/App.tsx","old_string":"old","new_string":"new"}}
{"name":"vscode_apply_edit","args":{"path":"src/App.tsx","old_string":"old","new_string":"new"}}
{"name":"vscode_command","args":{"command":"workbench.action.files.save"}}
```

`vscode_apply_edit` is treated as a write action by VD Agent. `vscode_command`
is treated as risky because VS Code commands can have side effects.
