<!--
  @author Virender Dhiman
  @year 2026
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# VS Code Bridge

VD Agent can read VS Code's current workspace/editor context through the local
VD Agent Bridge extension in `vscode-extension/`.

The bridge writes a local file at:

```text
.vd-agent/vscode-bridge.json
```

That file includes the active file, active language, selected text, visible
editors, and open text documents. VD Agent reads it with the `vscode_context`
tool. Source code and selections stay local.

## Install From Source

1. Open `vscode-extension/` in VS Code.
2. Press `F5` to start an Extension Development Host.
3. Open your project folder in that host window.
4. Run `VD Agent: Export Workspace Context` from the Command Palette.

For everyday use, package the extension with `vsce` or copy the folder into
your VS Code extensions development workflow.

## Use From VD Agent

Open the same repository in VD Agent. In a chat, ask for VS Code context or let
the agent call:

```json
{"name":"vscode_context","args":{}}
```

The bridge is optional. If it is not installed or has not exported context yet,
VD Agent falls back to its own workspace files, repo map, search, git diff, and
editor state.
